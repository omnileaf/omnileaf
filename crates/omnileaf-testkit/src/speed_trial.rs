use std::{
    fmt::{self, Display, Formatter},
    num::NonZeroUsize,
    time::{Duration, Instant},
};

use crate::TimingBudget;

pub const TIMED_PASSES: usize = 3;

const PERCENTILE: usize = 95;
const SUMMARY: [Statistic; 3] = [
    Statistic::Median,
    Statistic::Percentile95,
    Statistic::Slowest,
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Statistic {
    Median,
    Percentile95,
    Slowest,
}

impl Statistic {
    fn rank(self, count: usize) -> usize {
        match self {
            Self::Median => count / 2,
            Self::Percentile95 => (count * PERCENTILE).div_ceil(100) - 1,
            Self::Slowest => count - 1,
        }
    }

    const fn name(self) -> &'static str {
        match self {
            Self::Median => "median",
            Self::Percentile95 => "p95",
            Self::Slowest => "slowest",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Sampling {
    Once,
    Repeated {
        samples: NonZeroUsize,
        statistic: Statistic,
    },
}

impl Sampling {
    const fn samples(self) -> usize {
        match self {
            Self::Once => 1,
            Self::Repeated { samples, .. } => samples.get(),
        }
    }

    const fn statistic(self) -> Statistic {
        match self {
            Self::Once => Statistic::Slowest,
            Self::Repeated { statistic, .. } => statistic,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pass {
    WarmUp,
    Timed(usize),
}

impl Display for Pass {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::WarmUp => formatter.write_str("warm-up"),
            Self::Timed(number) => write!(formatter, "{number}"),
        }
    }
}

/// Times one untimed warm-up pass and [`TIMED_PASSES`] timed passes, and holds the fastest to the budget, since a stalled runner only ever adds time.
#[derive(Clone, Copy, Debug)]
pub struct SpeedTrial {
    pub measured: &'static str,
    pub sampling: Sampling,
    pub budget: TimingBudget,
}

impl SpeedTrial {
    /// Sets up each pass with `set_up_pass` and times only `sample`, dropping one pass's state before setting up the next.
    pub async fn run<P>(
        &self,
        mut set_up_pass: impl AsyncFnMut(Pass) -> P,
        mut sample: impl AsyncFnMut(&mut P),
    ) -> TrialOutcome {
        let passes = [Pass::WarmUp]
            .into_iter()
            .chain((1..=TIMED_PASSES).map(Pass::Timed));
        let mut timed = Vec::with_capacity(TIMED_PASSES);
        for pass in passes {
            let mut state = set_up_pass(pass).await;
            let mut timings = Vec::with_capacity(self.sampling.samples());
            for _ in 0..self.sampling.samples() {
                let started = Instant::now();
                sample(&mut state).await;
                timings.push(started.elapsed());
            }
            drop(state);
            if pass != Pass::WarmUp {
                timed.push(timings);
            }
        }
        TrialOutcome::from_passes(*self, timed)
    }
}

#[derive(Clone, Debug)]
pub struct TrialOutcome {
    trial: SpeedTrial,
    passes: Vec<Vec<Duration>>,
}

impl TrialOutcome {
    /// Panics on no passes or an empty pass, since a trial always times at least one sample in each.
    #[must_use]
    pub fn from_passes(trial: SpeedTrial, mut passes: Vec<Vec<Duration>>) -> Self {
        assert!(!passes.is_empty(), "a speed trial needs at least one pass");
        for timings in &mut passes {
            assert!(
                !timings.is_empty(),
                "a speed trial's pass needs at least one sample"
            );
            timings.sort_unstable();
        }
        Self { trial, passes }
    }

    #[must_use]
    pub fn fastest(&self) -> Duration {
        let statistic = self.trial.sampling.statistic();
        self.passes
            .iter()
            .map(|timings| at(timings, statistic))
            .fold(Duration::MAX, Duration::min)
    }

    #[must_use]
    pub fn is_within_budget(&self) -> bool {
        self.trial.budget.allows(self.fastest())
    }

    fn write_pass(&self, formatter: &mut Formatter<'_>, timings: &[Duration]) -> fmt::Result {
        if self.trial.sampling == Sampling::Once {
            return write!(formatter, "{:?}", at(timings, Statistic::Slowest));
        }
        let summary: Vec<String> = SUMMARY
            .iter()
            .map(|statistic| format!("{} {:?}", statistic.name(), at(timings, *statistic)))
            .collect();
        formatter.write_str(&summary.join(", "))
    }
}

#[expect(
    clippy::indexing_slicing,
    reason = "from_passes keeps every pass sorted and non-empty, and each rank is below its length"
)]
fn at(sorted: &[Duration], statistic: Statistic) -> Duration {
    sorted[statistic.rank(sorted.len())]
}

impl Display for TrialOutcome {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> fmt::Result {
        let SpeedTrial {
            measured,
            sampling,
            budget,
        } = self.trial;
        write!(formatter, "{measured}: ")?;
        if let Sampling::Repeated { statistic, .. } = sampling {
            write!(formatter, "{} ", statistic.name())?;
        }
        write!(
            formatter,
            "{:?} in the fastest of {} passes",
            self.fastest(),
            self.passes.len()
        )?;
        if let Sampling::Repeated { samples, .. } = sampling {
            write!(formatter, " of {samples} samples")?;
        }
        formatter.write_str(" (")?;
        for (index, timings) in self.passes.iter().enumerate() {
            if index > 0 {
                formatter.write_str("; ")?;
            }
            write!(formatter, "pass {}: ", index + 1)?;
            self.write_pass(formatter, timings)?;
        }
        let verdict = if self.is_within_budget() {
            "within"
        } else {
            "over"
        };
        write!(formatter, "), {verdict} the {budget}")
    }
}

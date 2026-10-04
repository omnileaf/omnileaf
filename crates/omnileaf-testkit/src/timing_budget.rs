use std::{
    env,
    fmt::{self, Display, Formatter},
    time::Duration,
};

pub const BUDGET_SLACK_VARIABLE: &str = "OMNILEAF_BUDGET_SLACK";

const NO_SLACK: f64 = 1.0;

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
#[error("{BUDGET_SLACK_VARIABLE} must be a number of at least 1, but is {value:?}")]
pub struct InvalidBudgetSlack {
    value: String,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TimingBudget {
    nominal: Duration,
    enforced: Duration,
    slack: f64,
}

impl TimingBudget {
    /// Scales `nominal` by `OMNILEAF_BUDGET_SLACK`, which CI sets where shared runners stall, and panics on a value that is not a number of at least 1.
    #[must_use]
    #[expect(
        clippy::panic,
        reason = "a malformed slack must stop the speed test rather than quietly change its budget"
    )]
    pub fn from_env(nominal: Duration) -> Self {
        let slack =
            env::var_os(BUDGET_SLACK_VARIABLE).map(|value| value.to_string_lossy().into_owned());
        Self::with_slack(nominal, slack.as_deref()).unwrap_or_else(|invalid| panic!("{invalid}"))
    }

    pub fn with_slack(nominal: Duration, slack: Option<&str>) -> Result<Self, InvalidBudgetSlack> {
        let Some(value) = slack else {
            return Ok(Self {
                nominal,
                enforced: nominal,
                slack: NO_SLACK,
            });
        };
        let invalid = || InvalidBudgetSlack {
            value: value.to_owned(),
        };
        let slack = value
            .parse::<f64>()
            .ok()
            .filter(|slack| slack.is_finite() && *slack >= NO_SLACK)
            .ok_or_else(invalid)?;
        let enforced =
            Duration::try_from_secs_f64(nominal.as_secs_f64() * slack).map_err(|_| invalid())?;
        Ok(Self {
            nominal,
            enforced,
            slack,
        })
    }

    #[must_use]
    pub const fn enforced(&self) -> Duration {
        self.enforced
    }

    #[must_use]
    pub fn allows(&self, elapsed: Duration) -> bool {
        elapsed <= self.enforced
    }
}

impl Display for TimingBudget {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> fmt::Result {
        write!(formatter, "{:?} budget", self.nominal)?;
        if self.enforced != self.nominal {
            write!(
                formatter,
                ", enforced as {:?} with a slack of {}",
                self.enforced, self.slack
            )?;
        }
        Ok(())
    }
}

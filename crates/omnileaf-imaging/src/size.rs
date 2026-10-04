#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Size {
    pub width: u32,
    pub height: u32,
}

impl Size {
    pub(crate) fn pixels(self) -> u64 {
        u64::from(self.width) * u64::from(self.height)
    }

    pub(crate) fn is_empty(self) -> bool {
        self.width == 0 || self.height == 0
    }
}

/// How much of a source image a thumbnail shows, and how large it is.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Plan {
    /// The rows from the top of the source the thumbnail shows, all of them unless the source is a tall strip.
    pub(crate) shown_height: u32,
    pub(crate) output: Size,
}

impl Plan {
    pub(crate) fn for_source(source: Size, max_width: u32, max_height_per_width: u32) -> Self {
        let shown_height = source
            .height
            .min(source.width.saturating_mul(max_height_per_width));
        let width = source.width.min(max_width);
        Self {
            shown_height,
            output: Size {
                width,
                height: scaled(shown_height, width, source.width).max(1),
            },
        }
    }

    /// The size the whole source shrinks to at the thumbnail's scale, which a decoder that scales as it decodes needs at least.
    pub(crate) fn whole_source_at_output_scale(self, source: Size) -> Size {
        Size {
            width: self.output.width,
            height: scaled(source.height, self.output.width, source.width).max(1),
        }
    }
}

/// Rounds `length * numerator / denominator` to the nearest whole pixel.
fn scaled(length: u32, numerator: u32, denominator: u32) -> u32 {
    let denominator = u64::from(denominator.max(1));
    let rounded = (u64::from(length) * u64::from(numerator) + denominator / 2) / denominator;
    u32::try_from(rounded).unwrap_or(u32::MAX)
}

#[cfg(test)]
mod tests {
    use proptest::prelude::*;

    use super::*;

    const MAX_WIDTH: u32 = 320;
    const MAX_HEIGHT_PER_WIDTH: u32 = 2;

    #[test]
    fn shows_the_top_of_a_strip_two_widths_tall() {
        let strip = Size {
            width: 800,
            height: 20_000,
        };

        let plan = Plan::for_source(strip, MAX_WIDTH, MAX_HEIGHT_PER_WIDTH);

        assert_eq!(
            plan,
            Plan {
                shown_height: 1600,
                output: Size {
                    width: 320,
                    height: 640
                }
            }
        );
    }

    proptest! {
        #[test]
        fn fits_any_source_without_stretching_or_growing_it(
            width in 1_u32..=100_000,
            height in 1_u32..=100_000,
        ) {
            let source = Size { width, height };

            let plan = Plan::for_source(source, MAX_WIDTH, MAX_HEIGHT_PER_WIDTH);

            let output = plan.output;
            prop_assert_eq!(output.width, width.min(MAX_WIDTH));
            prop_assert!(output.height >= 1);
            prop_assert!(output.height <= output.width * MAX_HEIGHT_PER_WIDTH);
            prop_assert!(plan.shown_height <= height);
            prop_assert!(plan.shown_height <= width * MAX_HEIGHT_PER_WIDTH);
            let scaled = u64::from(plan.shown_height) * u64::from(output.width);
            let expected = u64::from(output.height) * u64::from(width);
            prop_assert!(scaled.abs_diff(expected) <= u64::from(width));
        }
    }
}

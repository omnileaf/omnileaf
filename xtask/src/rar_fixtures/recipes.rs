use omnileaf_testkit::incompressible_bytes;
use serde::Serialize;

const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";
const PAGE_SEED: u64 = 53;
const FIRST_PAGE_NOISE: usize = 292;
const LAST_PAGE_NOISE: usize = 150;
const SCAN_PAGE_LENGTH: usize = 1_992;
const SCAN_LINE: &[u8] = b"scan line ";
const STABLE_ARGUMENTS: [&str; 3] = ["a", "-idq", "-ts-"];

pub(super) const COMIC_INFO_NAME: &str = "ComicInfo.xml";
pub(super) const SERIES: &str = "Sample Series 01";
pub(super) const NUMBER: &str = "1";

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Maker {
    Rar5,
    Rar4,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum Refusal {
    Encrypted,
    MultiVolume,
    SolidRar4,
}

#[derive(Clone, Copy, Debug)]
pub(super) enum Names {
    Plain,
    Unicode,
}

#[derive(Clone, Copy, Debug)]
pub(super) enum Expected {
    Opens,
    Refused(Refusal),
}

#[derive(Debug)]
pub(super) struct Recipe {
    pub(super) file: &'static str,
    pub(super) target: &'static str,
    pub(super) maker: Maker,
    pub(super) arguments: &'static [&'static str],
    pub(super) names: Names,
    pub(super) expected: Expected,
}

pub(super) struct Source {
    pub(super) name: String,
    pub(super) bytes: Vec<u8>,
}

pub(super) struct Sources {
    pub(super) pages: Vec<Source>,
    pub(super) comic_info: Source,
}

const fn recipe(
    file: &'static str,
    maker: Maker,
    arguments: &'static [&'static str],
    expected: Expected,
) -> Recipe {
    Recipe {
        file,
        target: file,
        maker,
        arguments,
        names: Names::Plain,
        expected,
    }
}

const fn unicode_names(
    file: &'static str,
    maker: Maker,
    arguments: &'static [&'static str],
) -> Recipe {
    Recipe {
        names: Names::Unicode,
        ..recipe(file, maker, arguments, Expected::Opens)
    }
}

const fn first_volume(
    file: &'static str,
    target: &'static str,
    maker: Maker,
    arguments: &'static [&'static str],
) -> Recipe {
    Recipe {
        target,
        ..recipe(
            file,
            maker,
            arguments,
            Expected::Refused(Refusal::MultiVolume),
        )
    }
}

pub(super) const RECIPES: [Recipe; 15] = [
    recipe("rar5-stored.cbr", Maker::Rar5, &["-m0"], Expected::Opens),
    recipe("rar5-normal.cbr", Maker::Rar5, &["-m3"], Expected::Opens),
    recipe(
        "rar5-best.cbr",
        Maker::Rar5,
        &["-m5", "-md128k"],
        Expected::Opens,
    ),
    recipe(
        "rar5-solid.cbr",
        Maker::Rar5,
        &["-s", "-m3"],
        Expected::Opens,
    ),
    unicode_names("rar5-unicode-names.cbr", Maker::Rar5, &["-m3"]),
    recipe(
        "rar4-stored.cbr",
        Maker::Rar4,
        &["-ma4", "-m0"],
        Expected::Opens,
    ),
    recipe(
        "rar4-normal.cbr",
        Maker::Rar4,
        &["-ma4", "-m3"],
        Expected::Opens,
    ),
    recipe(
        "rar4-ppmd.cbr",
        Maker::Rar4,
        &["-ma4", "-m3", "-mct+"],
        Expected::Opens,
    ),
    unicode_names("rar4-unicode-names.cbr", Maker::Rar4, &["-ma4", "-m3"]),
    recipe(
        "rar4-solid.cbr",
        Maker::Rar4,
        &["-ma4", "-s", "-m3"],
        Expected::Refused(Refusal::SolidRar4),
    ),
    recipe(
        "rar5-encrypted.cbr",
        Maker::Rar5,
        &["-m3", "-pomnileaf"],
        Expected::Refused(Refusal::Encrypted),
    ),
    recipe(
        "rar5-encrypted-headers.cbr",
        Maker::Rar5,
        &["-m3", "-hpomnileaf"],
        Expected::Refused(Refusal::Encrypted),
    ),
    recipe(
        "rar4-encrypted.cbr",
        Maker::Rar4,
        &["-ma4", "-m3", "-pomnileaf"],
        Expected::Refused(Refusal::Encrypted),
    ),
    first_volume(
        "rar5-multivolume.part1.rar",
        "rar5-multivolume.rar",
        Maker::Rar5,
        &["-m0", "-v1k"],
    ),
    first_volume(
        "rar4-multivolume.part1.rar",
        "rar4-multivolume.rar",
        Maker::Rar4,
        &["-ma4", "-m0", "-v1k"],
    ),
];

impl Names {
    fn of_pages(self) -> [&'static str; 3] {
        match self {
            Self::Plain => ["001.png", "002.png", "003.png"],
            Self::Unicode => ["001-\u{e9}\u{65e5}\u{672c}.png", "002.png", "003.png"],
        }
    }
}

impl Recipe {
    pub(super) fn sources(&self) -> Sources {
        let pages = self
            .names
            .of_pages()
            .into_iter()
            .enumerate()
            .map(|(index, name)| Source {
                name: name.to_owned(),
                bytes: page_bytes(index),
            })
            .collect();
        let comic_info =
            format!("<ComicInfo><Series>{SERIES}</Series><Number>{NUMBER}</Number></ComicInfo>");
        Sources {
            pages,
            comic_info: Source {
                name: COMIC_INFO_NAME.to_owned(),
                bytes: comic_info.into_bytes(),
            },
        }
    }

    pub(super) fn command(&self, sources: &Sources) -> Vec<String> {
        STABLE_ARGUMENTS
            .iter()
            .chain(self.arguments)
            .chain([&self.target])
            .map(|argument| (*argument).to_owned())
            .chain(sources.archiving_order().map(|source| source.name.clone()))
            .collect()
    }
}

impl Sources {
    pub(super) fn written(&self) -> impl Iterator<Item = &Source> {
        self.pages.iter().chain([&self.comic_info])
    }

    fn archiving_order(&self) -> impl Iterator<Item = &Source> {
        self.pages.iter().rev().chain([&self.comic_info])
    }
}

fn noise(offset: u64, length: usize) -> Vec<u8> {
    incompressible_bytes(PAGE_SEED + offset, length)
}

fn page_bytes(index: usize) -> Vec<u8> {
    let body = match index {
        0 => noise(0, FIRST_PAGE_NOISE),
        1 => SCAN_LINE
            .iter()
            .copied()
            .cycle()
            .take(SCAN_PAGE_LENGTH)
            .collect(),
        _ => [noise(0, FIRST_PAGE_NOISE), noise(2, LAST_PAGE_NOISE)].concat(),
    };
    [PNG_SIGNATURE.to_vec(), body].concat()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn volume_recipes() -> impl Iterator<Item = &'static Recipe> {
        RECIPES
            .iter()
            .filter(|recipe| matches!(recipe.expected, Expected::Refused(Refusal::MultiVolume)))
    }

    #[test]
    fn asks_for_the_old_format_in_every_rar4_recipe() {
        for recipe in RECIPES.iter().filter(|recipe| recipe.maker == Maker::Rar4) {
            assert!(recipe.arguments.contains(&"-ma4"), "{}", recipe.file);
        }
    }

    #[test]
    fn names_each_first_volume_the_way_rar_does() {
        for recipe in volume_recipes() {
            assert_eq!(
                recipe.file,
                recipe.target.replace(".rar", ".part1.rar"),
                "{}",
                recipe.file
            );
        }
        assert_eq!(volume_recipes().count(), 2);
    }

    #[test]
    fn archives_the_pages_against_their_reading_order() {
        let recipe = &RECIPES[0];
        let sources = recipe.sources();

        let command = recipe.command(&sources);

        let archived = &command[command.len() - 4..];
        assert_eq!(archived, ["003.png", "002.png", "001.png", COMIC_INFO_NAME]);
    }

    #[test]
    fn makes_the_third_page_repeat_the_first_so_a_solid_archive_must_carry_its_window() {
        let sources = RECIPES[0].sources();

        let first = &sources.pages[0].bytes[PNG_SIGNATURE.len()..];
        let third = &sources.pages[2].bytes[PNG_SIGNATURE.len()..];

        assert!(third.starts_with(first));
        assert!(third.len() > first.len());
    }

    #[test]
    fn gives_two_recipes_names_outside_ascii() {
        let unicode: Vec<_> = RECIPES
            .iter()
            .filter(|recipe| matches!(recipe.names, Names::Unicode))
            .map(|recipe| recipe.maker)
            .collect();

        assert_eq!(unicode, [Maker::Rar5, Maker::Rar4]);
    }
}

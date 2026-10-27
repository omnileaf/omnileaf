use std::fmt::{self, Write};

const REGION_SEPARATOR: char = '-';

const ISO_639_1_CODES: [[u8; 2]; 183] = [
    *b"aa", *b"ab", *b"ae", *b"af", *b"ak", *b"am", *b"an", *b"ar", *b"as", *b"av", *b"ay", *b"az",
    *b"ba", *b"be", *b"bg", *b"bi", *b"bm", *b"bn", *b"bo", *b"br", *b"bs", *b"ca", *b"ce", *b"ch",
    *b"co", *b"cr", *b"cs", *b"cu", *b"cv", *b"cy", *b"da", *b"de", *b"dv", *b"dz", *b"ee", *b"el",
    *b"en", *b"eo", *b"es", *b"et", *b"eu", *b"fa", *b"ff", *b"fi", *b"fj", *b"fo", *b"fr", *b"fy",
    *b"ga", *b"gd", *b"gl", *b"gn", *b"gu", *b"gv", *b"ha", *b"he", *b"hi", *b"ho", *b"hr", *b"ht",
    *b"hu", *b"hy", *b"hz", *b"ia", *b"id", *b"ie", *b"ig", *b"ii", *b"ik", *b"io", *b"is", *b"it",
    *b"iu", *b"ja", *b"jv", *b"ka", *b"kg", *b"ki", *b"kj", *b"kk", *b"kl", *b"km", *b"kn", *b"ko",
    *b"kr", *b"ks", *b"ku", *b"kv", *b"kw", *b"ky", *b"la", *b"lb", *b"lg", *b"li", *b"ln", *b"lo",
    *b"lt", *b"lu", *b"lv", *b"mg", *b"mh", *b"mi", *b"mk", *b"ml", *b"mn", *b"mr", *b"ms", *b"mt",
    *b"my", *b"na", *b"nb", *b"nd", *b"ne", *b"ng", *b"nl", *b"nn", *b"no", *b"nr", *b"nv", *b"ny",
    *b"oc", *b"oj", *b"om", *b"or", *b"os", *b"pa", *b"pi", *b"pl", *b"ps", *b"pt", *b"qu", *b"rm",
    *b"rn", *b"ro", *b"ru", *b"rw", *b"sa", *b"sc", *b"sd", *b"se", *b"sg", *b"si", *b"sk", *b"sl",
    *b"sm", *b"sn", *b"so", *b"sq", *b"sr", *b"ss", *b"st", *b"su", *b"sv", *b"sw", *b"ta", *b"te",
    *b"tg", *b"th", *b"ti", *b"tk", *b"tl", *b"tn", *b"to", *b"tr", *b"ts", *b"tt", *b"tw", *b"ty",
    *b"ug", *b"uk", *b"ur", *b"uz", *b"ve", *b"vi", *b"vo", *b"wa", *b"wo", *b"xh", *b"yi", *b"yo",
    *b"za", *b"zh", *b"zu",
];

const _: () = assert!(ascends(&ISO_639_1_CODES));

const fn ascends(codes: &[[u8; 2]]) -> bool {
    let mut rest = codes;
    while let [first, tail @ ..] = rest {
        if let [second, ..] = tail
            && u16::from_be_bytes(*first) >= u16::from_be_bytes(*second)
        {
            return false;
        }
        rest = tail;
    }
    true
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct LanguageTag {
    language: [u8; 2],
    region: Option<Region>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum Region {
    Country([u8; 2]),
    Area([u8; 3]),
}

impl LanguageTag {
    pub(super) fn parse(tag: &str) -> Option<Self> {
        let tag = tag.trim();
        let (language, region) = match tag.split_once(REGION_SEPARATOR) {
            Some((language, region)) => (language, Some(Region::parse(region)?)),
            None => (tag, None),
        };
        let language = <[u8; 2]>::try_from(language.as_bytes())
            .ok()?
            .map(|byte| byte.to_ascii_lowercase());
        ISO_639_1_CODES.binary_search(&language).ok()?;
        Some(Self { language, region })
    }
}

impl Region {
    fn parse(region: &str) -> Option<Self> {
        let bytes = region.as_bytes();
        if let Ok(letters) = <[u8; 2]>::try_from(bytes)
            && letters.iter().all(u8::is_ascii_alphabetic)
        {
            return Some(Self::Country(letters.map(|byte| byte.to_ascii_uppercase())));
        }
        <[u8; 3]>::try_from(bytes)
            .ok()
            .filter(|digits| digits.iter().all(u8::is_ascii_digit))
            .map(Self::Area)
    }

    fn as_bytes(&self) -> &[u8] {
        match self {
            Self::Country(letters) => letters,
            Self::Area(digits) => digits,
        }
    }
}

impl fmt::Display for LanguageTag {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write_ascii(formatter, &self.language)?;
        if let Some(region) = &self.region {
            formatter.write_char(REGION_SEPARATOR)?;
            write_ascii(formatter, region.as_bytes())?;
        }
        Ok(())
    }
}

fn write_ascii(formatter: &mut fmt::Formatter<'_>, bytes: &[u8]) -> fmt::Result {
    bytes
        .iter()
        .try_for_each(|byte| formatter.write_char(char::from(*byte)))
}

use colored::Color as ColoredColor;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Nation {
    Tera,
    Sora,
    Aqua,
    Solar,
    Luna,
}

impl Nation {
    pub fn name(&self) -> &'static str {
        match self {
            Nation::Tera => "Tera",
            Nation::Sora => "Sora",
            Nation::Aqua => "Aqua",
            Nation::Solar => "Solar",
            Nation::Luna => "Luna",
        }
    }

    pub fn logging_color(&self) -> ColoredColor {
        match self {
            Nation::Tera => ColoredColor::Blue,
            Nation::Sora => ColoredColor::Red,
            Nation::Aqua => ColoredColor::Green,
            Nation::Solar => ColoredColor::Yellow,
            Nation::Luna => ColoredColor::White,
        }
    }
}

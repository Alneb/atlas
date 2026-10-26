//! The Boox pens: strokes drawn with the openink engine — knote2's seven pens and libneo_pen's width
//! formulas, vendored from openink (crates/vendor/openink-stroke) — for the native pen canvas. Pure: the
//! JNI in glue.rs only moves arrays. The wire formats are openink's own `org.openink.stroke.StrokeEngine`'s, so Java
//! written against theirs reads these arrays the same way:
//! - config `[f32; 8]`: width (px), pressureSensitivity, smoothLevel, velocitySensitivity, tiltEnabled (0/1), tiltScale,
//!   dpi, minWidth (a 6-float config, as older drawings keep, reads as dpi 300, minWidth 0.001)
//! - samples `6 n` floats: x, y (px), pressure 0–1, tiltX, tiltY (degrees), tMs since pen-down
//! - ink: left, top, right, bottom (NaN when empty), then the pen's data — convex polygons for the filled pens
//!   (`n, x0, y0, …` each), `x, y, size, angle, alpha` per dab for pencil and charcoal ([`output`]).
//!
//! A stroke is a pure function of its samples and config (FROM-BOOX.md), so a saved drawing keeps both and is redrawn
//! exactly; the config stored is the resolved one, never "the default" (it depends on the screen's dpi).
use openink_stroke::{Output, PenConfig, PenKind, Sample, Stroke};

pub const CONFIG_LEN: usize = 8;
pub const SAMPLE_LEN: usize = 6;

/// Why a call was refused: said to the Java side as the exception's message.
#[derive(Debug, PartialEq)]
pub enum Refused {
    NoSuchPen(i32),
    Config(usize),
    Samples,
}

impl std::fmt::Display for Refused {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Refused::NoSuchPen(c) => write!(f, "no pen {c} (0–6: ballpoint, fountain, brush, marker, square, pencil, charcoal)"),
            Refused::Config(n) => write!(f, "a pen's config is {CONFIG_LEN} (or 6) floats, not {n}"),
            Refused::Samples => write!(f, "samples are {SAMPLE_LEN} floats each, all finite"),
        }
    }
}

fn pen(code: i32) -> Result<PenKind, Refused> {
    PenKind::from_code(code).ok_or(Refused::NoSuchPen(code))
}

fn config(v: &[f32]) -> Result<PenConfig, Refused> {
    let (dpi, min_width) = match v.len() {
        8 => (v[6], v[7]),
        6 => (300.0, 0.001),
        n => return Err(Refused::Config(n)),
    };
    let &[width, pressure_sensitivity, smooth_level, velocity_sensitivity, tilt, tilt_scale] = &v[..6] else { return Err(Refused::Config(v.len())) };
    Ok(PenConfig { width, pressure_sensitivity, smooth_level, velocity_sensitivity, tilt_enabled: tilt != 0.0, tilt_scale, dpi, min_width }.sanitized())
}

fn wire(c: &PenConfig) -> [f32; CONFIG_LEN] {
    [c.width, c.pressure_sensitivity, c.smooth_level, c.velocity_sensitivity, if c.tilt_enabled { 1.0 } else { 0.0 }, c.tilt_scale, c.dpi, c.min_width]
}

/// One NaN would poison the whole stroke: a ragged or non-finite array is refused, not drawn.
fn samples(v: &[f32]) -> Result<Vec<Sample>, Refused> {
    if !v.len().is_multiple_of(SAMPLE_LEN) || !v.iter().all(|x| x.is_finite()) {
        return Err(Refused::Samples);
    }
    Ok(v.as_chunks::<SAMPLE_LEN>().0.iter().map(|s| Sample { x: s[0], y: s[1], pressure: s[2], tilt_x: s[3], tilt_y: s[4], t_ms: s[5] }).collect())
}

/// A pen's knote2 defaults at this screen's dpi, resolved (what a drawing keeps), in the form Onyx's instant ink
/// draws them (openink `sf::live_pen`, boox_5c_re docs/SF-INSTANT-INK.md): rendered with this config, a settled
/// stroke is the line SurfaceFlinger drew while it was written.
pub fn defaults(code: i32, dpi: f32) -> Result<[f32; CONFIG_LEN], Refused> {
    let kind = pen(code)?;
    Ok(wire(&openink_stroke::sf::live_pen(kind, &PenConfig::knote2_default(kind, dpi)).settled))
}

/// What to tell Onyx's instant ink for this pen at this config (screen px): `style, width, exact (0/1), n,
/// params[n]`, then the settled config ([`CONFIG_LEN`] floats).
pub fn live(code: i32, cfg: &[f32]) -> Result<Vec<f32>, Refused> {
    let p = openink_stroke::sf::live_pen(pen(code)?, &config(cfg)?);
    let mut v = vec![p.style.code() as f32, p.sf_width, if p.exact { 1.0 } else { 0.0 }, p.sf_params.len() as f32];
    v.extend_from_slice(&p.sf_params);
    v.extend(wire(&p.settled));
    Ok(v)
}

/// The charcoal's look: its dabs dithered to on/off pixels the way libneo's charcoal V2 draws them
/// (openink `raster::charcoal_bitmap`), as one alpha bitmap: `left, top, width, height` (i32 LE each, engine px),
/// then `width × height` bytes (0 or 255). Empty ink gives a 0 × 0 bitmap.
pub fn charcoal(code: i32, cfg: &[f32], raw: &[f32]) -> Result<Vec<u8>, Refused> {
    let ink = Stroke::new(pen(code)?, config(cfg)?).render(&samples(raw)?);
    let (l, t, w, h, px) = openink_stroke::raster::charcoal_bitmap(&ink.data);
    let mut out = Vec::with_capacity(16 + px.len());
    for v in [l, t, w as i32, h as i32] {
        out.extend_from_slice(&v.to_le_bytes());
    }
    out.extend_from_slice(&px);
    Ok(out)
}

/// How the pen's ink is laid down: 0 filled polygons, 1 the same composited translucent (the marker), 2 dabs.
pub fn output(code: i32) -> Result<i32, Refused> {
    Ok(match pen(code)?.output() {
        Output::Fill => 0,
        Output::Translucent => 1,
        Output::Dabs => 2,
    })
}

/// A whole recorded stroke's ink (drawn once at pen-up, and again whenever the drawing is redrawn).
pub fn render(code: i32, cfg: &[f32], raw: &[f32]) -> Result<Vec<f32>, Refused> {
    let ink = Stroke::new(pen(code)?, config(cfg)?).render(&samples(raw)?);
    let mut out = Vec::with_capacity(4 + ink.data.len());
    out.extend(ink.bounds.unwrap_or([f32::NAN; 4]));
    out.extend_from_slice(&ink.data);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A short line pressed harder towards its end, as the pen sends it: 482 Hz-ish samples.
    fn line() -> Vec<f32> {
        (0..40).flat_map(|i| [100.0 + i as f32 * 3.0, 200.0, 0.2 + i as f32 * 0.01, 0.0, 0.0, i as f32 * 2.0]).collect()
    }

    #[test]
    fn every_pen_draws_a_line_inside_its_bounds() {
        for code in 0..7 {
            let cfg = defaults(code, 300.0).unwrap();
            let ink = render(code, &cfg, &line()).unwrap();
            let [l, t, r, b] = [ink[0], ink[1], ink[2], ink[3]];
            assert!(l <= 100.0 && r >= 217.0 && t < 200.0 && b > 200.0, "pen {code}: bounds {:?}", &ink[..4]);
            assert!(ink.len() > 4, "pen {code} drew nothing");
            assert!(output(code).unwrap() == if code == 3 { 1 } else if code >= 5 { 2 } else { 0 });
        }
    }

    #[test]
    fn the_fountain_is_the_one_onyx_draws() {
        let cfg = defaults(1, 300.0).unwrap();
        assert_eq!((cfg[6], cfg[7]), (320.0, 1.0), "SF's FountainV2: dpi 320, minWidth 1");
        let v = live(1, &cfg).unwrap();
        assert_eq!(v[0], 1.0, "style 1, FountainV2");
        assert!((v[1] + 3.0 - cfg[0]).abs() < 1e-4, "SF draws strokeWidth + 3");
        assert_eq!(&v[v.len() - CONFIG_LEN..], &cfg[..], "the settled config is the one a drawing keeps");
    }

    #[test]
    fn the_same_samples_and_config_draw_the_same_ink() {
        let cfg = defaults(1, 226.0).unwrap();
        assert_eq!(render(1, &cfg, &line()).unwrap(), render(1, &cfg, &line()).unwrap());
    }

    #[test]
    fn bad_input_is_refused_and_said() {
        assert_eq!(render(9, &[0.0; 6], &line()), Err(Refused::NoSuchPen(9)));
        assert_eq!(render(0, &[1.0; 5], &line()), Err(Refused::Config(5)));
        assert!(render(0, &[3.0, 0.3, 0.6, 0.5, 0.0, 3.0], &line()).is_ok(), "an older drawing's 6-float config still draws");
        let mut nan = line();
        nan[7] = f32::NAN;
        assert_eq!(render(0, &defaults(0, 300.0).unwrap(), &nan), Err(Refused::Samples));
        assert_eq!(render(0, &defaults(0, 300.0).unwrap(), &[1.0; 7]), Err(Refused::Samples));
        let empty = render(0, &defaults(0, 300.0).unwrap(), &[]).unwrap();
        assert!(empty[0].is_nan() && empty.len() == 4, "no samples: empty ink, not an error");
    }
}

//! # The Bases expression language
//!
//! Obsidian Bases let you write little expressions like
//! `status == "done" && file.mtime >= today() - "7 days"`. This module is a tiny
//! interpreter for a practical subset of that language. It runs in three classic
//! stages (the same pipeline every programming language uses):
//!
//! 1. **Lexer** (`lex`): raw text → a flat list of *tokens* (`Ident`, `Num`,
//!    `Op("==")`, `LParen`, …). It just chops the string into meaningful pieces.
//! 2. **Parser** (`parse` + the `Parser` struct): tokens → an *abstract syntax
//!    tree* (`Expr`). This is recursive-descent parsing, with one function per
//!    precedence level so `a || b && c` groups correctly.
//! 3. **Evaluator** (`eval`): walk the `Expr` tree against a `Context` (the note
//!    being tested) and produce a `Val`.
//!
//! Design rule: **never panic on bad input.** Real vaults contain typo'd bases, so
//! parse errors and unknown functions degrade to `true`/`Val::Null` rather than
//! crashing a request.

use super::dates;
use super::value::Val;

/// The seam between the engine and the data. The evaluator never touches a note
/// directly — it asks through this trait, which `bases.rs` implements (`NoteCtx`).
/// A `trait` is like an interface: any type that provides these methods can be
/// used as a `Context`. This keeps the expression engine independent of how notes
/// are stored.
pub trait Context {
    fn file_field(&self, name: &str) -> Val; // `file.name`, `file.mtime`, …
    fn property(&self, name: &str) -> Val; // a frontmatter property (`note.x` or bare `x`)
    fn has_property(&self, name: &str) -> bool; // `file.hasProperty("x")`
    fn formula(&self, name: &str) -> Val; // a computed `formula.x`
    /// Resolve `this.file.<name>` — the file the base is embedded in / opened from.
    fn this_field(&self, name: &str) -> Val;
}

/// The abstract syntax tree. An expression is a *tree* of these nodes — e.g.
/// `a.b == 1` parses to `Binary("==", Member(Ident("a"), "b"), Num(1.0))`.
/// `Box<Expr>` is a heap-allocated child node; it's needed because a struct can't
/// directly contain itself (it would be infinitely sized), so we point to the
/// child via a `Box` (a pointer that owns what it points at).
#[derive(Debug, Clone)]
pub enum Expr {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Ident(String),                        // a bare name like `status` or `file`
    Member(Box<Expr>, String),            // `obj.field`
    Index(Box<Expr>, Box<Expr>),          // `obj[key]`
    Call(Box<Expr>, Vec<Expr>),           // `f(arg, arg)` or `obj.method(arg)`
    Unary(char, Box<Expr>),               // `!x` or `-x`
    Binary(String, Box<Expr>, Box<Expr>), // `a + b`, `a == b`, `a && b`, …
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Ident(String),
    Num(f64),
    Str(String),
    Op(String),
    LParen,
    RParen,
    LBrack,
    RBrack,
    Comma,
    Dot,
}

fn lex(src: &str) -> Result<Vec<Tok>, String> {
    let mut toks = Vec::new();
    let chars: Vec<char> = src.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
            continue;
        }
        match c {
            '(' => {
                toks.push(Tok::LParen);
                i += 1;
            }
            ')' => {
                toks.push(Tok::RParen);
                i += 1;
            }
            '[' => {
                toks.push(Tok::LBrack);
                i += 1;
            }
            ']' => {
                toks.push(Tok::RBrack);
                i += 1;
            }
            ',' => {
                toks.push(Tok::Comma);
                i += 1;
            }
            '.' => {
                toks.push(Tok::Dot);
                i += 1;
            }
            '"' | '\'' => {
                let quote = c;
                i += 1;
                let mut s = String::new();
                while i < chars.len() && chars[i] != quote {
                    if chars[i] == '\\' && i + 1 < chars.len() {
                        i += 1;
                        s.push(chars[i]);
                    } else {
                        s.push(chars[i]);
                    }
                    i += 1;
                }
                i += 1; // closing quote
                toks.push(Tok::Str(s));
            }
            c if c.is_ascii_digit() => {
                let start = i;
                while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                    // avoid swallowing a member access dot like `1.foo`
                    if chars[i] == '.' && (i + 1 >= chars.len() || !chars[i + 1].is_ascii_digit()) {
                        break;
                    }
                    i += 1;
                }
                let s: String = chars[start..i].iter().collect();
                let n: f64 = s.parse().map_err(|_| format!("bad number {s}"))?;
                toks.push(Tok::Num(n));
            }
            c if c.is_alphabetic() || c == '_' => {
                let start = i;
                while i < chars.len() && (chars[i].is_alphanumeric() || chars[i] == '_') {
                    i += 1;
                }
                let s: String = chars[start..i].iter().collect();
                toks.push(Tok::Ident(s));
            }
            _ => {
                // operators (possibly two-char)
                let two: String = chars[i..(i + 2).min(chars.len())].iter().collect();
                if ["==", "!=", "<=", ">=", "&&", "||"].contains(&two.as_str()) {
                    toks.push(Tok::Op(two));
                    i += 2;
                } else if "+-*/<>!".contains(c) {
                    toks.push(Tok::Op(c.to_string()));
                    i += 1;
                } else {
                    return Err(format!("unexpected char {c:?}"));
                }
            }
        }
    }
    Ok(toks)
}

// ---------------------------------------------------------------------------
// Parser (recursive descent)
// ---------------------------------------------------------------------------
//
// `Parser` holds the token list and a cursor `pos`. Parsing is a ladder of
// methods, one per precedence level — `parse` → `or` → `and` → `equality` →
// `comparison` → `add` → `mul` → `unary` → `postfix` → `primary`. Each level
// parses the next-tighter level and then loops while it sees its own operators,
// which is what makes `1 + 2 * 3` bind as `1 + (2 * 3)` and `a || b && c` as
// `a || (b && c)`. `peek`/`next`/`eat_op` are the little cursor helpers.

struct Parser {
    toks: Vec<Tok>,
    pos: usize,
}

impl Parser {
    fn peek(&self) -> Option<&Tok> {
        self.toks.get(self.pos)
    }
    fn next(&mut self) -> Option<Tok> {
        let t = self.toks.get(self.pos).cloned();
        self.pos += 1;
        t
    }
    fn eat_op(&mut self, ops: &[&str]) -> Option<String> {
        if let Some(Tok::Op(o)) = self.peek() {
            if ops.contains(&o.as_str()) {
                let o = o.clone();
                self.pos += 1;
                return Some(o);
            }
        }
        None
    }

    fn parse(&mut self) -> Result<Expr, String> {
        let e = self.or()?;
        Ok(e)
    }

    fn or(&mut self) -> Result<Expr, String> {
        let mut left = self.and()?;
        while self.eat_op(&["||"]).is_some() {
            let right = self.and()?;
            left = Expr::Binary("||".into(), Box::new(left), Box::new(right));
        }
        Ok(left)
    }
    fn and(&mut self) -> Result<Expr, String> {
        let mut left = self.equality()?;
        while self.eat_op(&["&&"]).is_some() {
            let right = self.equality()?;
            left = Expr::Binary("&&".into(), Box::new(left), Box::new(right));
        }
        Ok(left)
    }
    fn equality(&mut self) -> Result<Expr, String> {
        let mut left = self.comparison()?;
        while let Some(op) = self.eat_op(&["==", "!="]) {
            let right = self.comparison()?;
            left = Expr::Binary(op, Box::new(left), Box::new(right));
        }
        Ok(left)
    }
    fn comparison(&mut self) -> Result<Expr, String> {
        let mut left = self.additive()?;
        while let Some(op) = self.eat_op(&["<", ">", "<=", ">="]) {
            let right = self.additive()?;
            left = Expr::Binary(op, Box::new(left), Box::new(right));
        }
        Ok(left)
    }
    fn additive(&mut self) -> Result<Expr, String> {
        let mut left = self.multiplicative()?;
        while let Some(op) = self.eat_op(&["+", "-"]) {
            let right = self.multiplicative()?;
            left = Expr::Binary(op, Box::new(left), Box::new(right));
        }
        Ok(left)
    }
    fn multiplicative(&mut self) -> Result<Expr, String> {
        let mut left = self.unary()?;
        while let Some(op) = self.eat_op(&["*", "/"]) {
            let right = self.unary()?;
            left = Expr::Binary(op, Box::new(left), Box::new(right));
        }
        Ok(left)
    }
    fn unary(&mut self) -> Result<Expr, String> {
        if let Some(op) = self.eat_op(&["!", "-"]) {
            let e = self.unary()?;
            return Ok(Expr::Unary(op.chars().next().unwrap(), Box::new(e)));
        }
        self.postfix()
    }
    fn postfix(&mut self) -> Result<Expr, String> {
        let mut e = self.primary()?;
        loop {
            match self.peek() {
                Some(Tok::Dot) => {
                    self.next();
                    let name = match self.next() {
                        Some(Tok::Ident(s)) => s,
                        other => return Err(format!("expected name after '.', got {other:?}")),
                    };
                    e = Expr::Member(Box::new(e), name);
                }
                Some(Tok::LBrack) => {
                    self.next();
                    let idx = self.or()?;
                    match self.next() {
                        Some(Tok::RBrack) => {}
                        other => return Err(format!("expected ']' got {other:?}")),
                    }
                    e = Expr::Index(Box::new(e), Box::new(idx));
                }
                Some(Tok::LParen) => {
                    self.next();
                    let mut args = Vec::new();
                    if !matches!(self.peek(), Some(Tok::RParen)) {
                        loop {
                            args.push(self.or()?);
                            match self.peek() {
                                Some(Tok::Comma) => {
                                    self.next();
                                }
                                _ => break,
                            }
                        }
                    }
                    match self.next() {
                        Some(Tok::RParen) => {}
                        other => return Err(format!("expected ')' got {other:?}")),
                    }
                    e = Expr::Call(Box::new(e), args);
                }
                _ => break,
            }
        }
        Ok(e)
    }
    fn primary(&mut self) -> Result<Expr, String> {
        match self.next() {
            Some(Tok::Num(n)) => Ok(Expr::Num(n)),
            Some(Tok::Str(s)) => Ok(Expr::Str(s)),
            Some(Tok::Ident(s)) => match s.as_str() {
                "true" => Ok(Expr::Bool(true)),
                "false" => Ok(Expr::Bool(false)),
                "null" => Ok(Expr::Null),
                _ => Ok(Expr::Ident(s)),
            },
            Some(Tok::LParen) => {
                let e = self.or()?;
                match self.next() {
                    Some(Tok::RParen) => Ok(e),
                    other => Err(format!("expected ')' got {other:?}")),
                }
            }
            other => Err(format!("unexpected token {other:?}")),
        }
    }
}

/// Public entry to stages 1+2: text → tokens (`lex`) → syntax tree (`Parser`).
/// Returns `Err` with a message if the input is malformed (e.g. unbalanced
/// parens, or leftover tokens after a complete expression). Callers in `bases.rs`
/// treat that error leniently rather than failing the whole base.
pub fn parse(src: &str) -> Result<Expr, String> {
    let toks = lex(src)?;
    let mut p = Parser { toks, pos: 0 };
    let e = p.parse()?;
    if p.pos != p.toks.len() {
        return Err(format!("trailing tokens at {}", p.pos));
    }
    Ok(e)
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

/// Stage 3: evaluate a parsed expression against a note's `Context` to a `Val`.
/// `&dyn Context` means "a reference to some type implementing Context" — the
/// concrete type (`NoteCtx`) is decided at runtime.
pub fn eval(e: &Expr, ctx: &dyn Context) -> Val {
    eval_scoped(e, ctx, None)
}

/// The real recursive evaluator. `scope` carries the current `value` binding used
/// inside `.filter(value …)` (it's `None` everywhere else). Each `match` arm
/// handles one kind of AST node, recursing into children as needed.
fn eval_scoped(e: &Expr, ctx: &dyn Context, scope: Option<&Val>) -> Val {
    match e {
        Expr::Null => Val::Null,
        Expr::Bool(b) => Val::Bool(*b),
        Expr::Num(n) => Val::Num(*n),
        Expr::Str(s) => Val::Str(s.clone()),
        // A bare identifier: `value` is the filter scope; the reserved roots
        // (file/note/this/formula) only mean something with a `.member` after them, so
        // alone they're Null; anything else is looked up as a note property — including
        // `date` / `link`, which are functions only when called (Atlas change: a `date`
        // property is common in the user's notes).
        Expr::Ident(name) => match name.as_str() {
            "value" => scope.cloned().unwrap_or(Val::Null),
            "file" | "note" | "this" | "formula" => Val::Null,
            other => ctx.property(other),
        },
        Expr::Unary(op, inner) => {
            let v = eval_scoped(inner, ctx, scope);
            match op {
                '!' => Val::Bool(!v.truthy()),
                '-' => Val::Num(-v.as_num().unwrap_or(0.0)),
                _ => Val::Null,
            }
        }
        Expr::Binary(op, a, b) => eval_binary(op, a, b, ctx, scope),
        Expr::Member(obj, name) => eval_member(obj, name, ctx, scope),
        Expr::Index(obj, idx) => {
            let o = eval_scoped(obj, ctx, scope);
            let i = eval_scoped(idx, ctx, scope);
            match (&o, &i) {
                (Val::Map(m), Val::Str(k)) => m.get(k).cloned().unwrap_or(Val::Null),
                (Val::List(l), Val::Num(n)) => l.get(*n as usize).cloned().unwrap_or(Val::Null),
                _ => Val::Null,
            }
        }
        Expr::Call(callee, args) => eval_call(callee, args, ctx, scope),
    }
}

fn eval_binary(op: &str, a: &Expr, b: &Expr, ctx: &dyn Context, scope: Option<&Val>) -> Val {
    match op {
        "&&" => Val::Bool(eval_scoped(a, ctx, scope).truthy() && eval_scoped(b, ctx, scope).truthy()),
        "||" => Val::Bool(eval_scoped(a, ctx, scope).truthy() || eval_scoped(b, ctx, scope).truthy()),
        _ => {
            let va = eval_scoped(a, ctx, scope);
            let vb = eval_scoped(b, ctx, scope);
            match op {
                "==" => Val::Bool(va.eq_val(&vb)),
                "!=" => Val::Bool(!va.eq_val(&vb)),
                "<" | ">" | "<=" | ">=" => {
                    let ord = va.cmp_val(&vb);
                    let r = match (ord, op) {
                        (Some(o), "<") => o.is_lt(),
                        (Some(o), ">") => o.is_gt(),
                        (Some(o), "<=") => o.is_le(),
                        (Some(o), ">=") => o.is_ge(),
                        _ => false,
                    };
                    Val::Bool(r)
                }
                "+" => {
                    if let Val::Date(d) = va {
                        if let Some(dur) = as_duration(&vb) {
                            return Val::Date(d + dur);
                        }
                    }
                    if let (Some(x), Some(y)) = (va.as_num(), vb.as_num()) {
                        if !matches!(va, Val::Str(_)) && !matches!(vb, Val::Str(_)) {
                            return Val::Num(x + y);
                        }
                    }
                    Val::Str(format!("{}{}", to_plain(&va), to_plain(&vb)))
                }
                "-" => {
                    if let Val::Date(d) = va {
                        if let Some(dur) = as_duration(&vb) {
                            return Val::Date(d - dur);
                        }
                    }
                    Val::Num(va.as_num().unwrap_or(0.0) - vb.as_num().unwrap_or(0.0))
                }
                "*" => Val::Num(va.as_num().unwrap_or(0.0) * vb.as_num().unwrap_or(0.0)),
                "/" => {
                    let d = vb.as_num().unwrap_or(0.0);
                    if d == 0.0 {
                        Val::Null
                    } else {
                        Val::Num(va.as_num().unwrap_or(0.0) / d)
                    }
                }
                _ => Val::Null,
            }
        }
    }
}

fn eval_member(obj: &Expr, name: &str, ctx: &dyn Context, scope: Option<&Val>) -> Val {
    // this.file.<name>  (host file: name, path, ext, folder, ctime, mtime, properties, …)
    if let Expr::Member(inner, mid) = obj {
        if matches!(inner.as_ref(), Expr::Ident(i) if i == "this") && mid == "file" {
            return ctx.this_field(name);
        }
    }
    if let Expr::Ident(root) = obj {
        match root.as_str() {
            "file" => return ctx.file_field(name),
            "note" => return ctx.property(name),
            _ => {}
        }
    }
    // generic: .length, or map field access
    let v = eval_scoped(obj, ctx, scope);
    match name {
        "length" => match &v {
            Val::List(l) => Val::Num(l.len() as f64),
            Val::Str(s) => Val::Num(s.chars().count() as f64),
            Val::Null => Val::Num(0.0),
            _ => Val::Num(1.0),
        },
        _ => match &v {
            Val::Map(m) => m.get(name).cloned().unwrap_or(Val::Null),
            _ => Val::Null,
        },
    }
}

fn eval_call(callee: &Expr, args: &[Expr], ctx: &dyn Context, scope: Option<&Val>) -> Val {
    // free functions: link(), date(), number()
    if let Expr::Ident(f) = callee {
        match f.as_str() {
            "link" => {
                let a = args.first().map(|e| eval_scoped(e, ctx, scope)).unwrap_or(Val::Null);
                return Val::Link(to_plain(&a));
            }
            "date" => {
                let a = args.first().map(|e| eval_scoped(e, ctx, scope)).unwrap_or(Val::Null);
                return match a {
                    Val::Date(d) => Val::Date(d),
                    other => dates::parse(&to_plain(&other)).map(Val::Date).unwrap_or(Val::Null),
                };
            }
            "number" => {
                let a = args.first().map(|e| eval_scoped(e, ctx, scope)).unwrap_or(Val::Null);
                return a.as_num().map(Val::Num).unwrap_or(Val::Null);
            }
            "if" => {
                let cond = args.first().map(|e| eval_scoped(e, ctx, scope)).unwrap_or(Val::Null);
                let idx = if cond.truthy() { 1 } else { 2 };
                return args.get(idx).map(|e| eval_scoped(e, ctx, scope)).unwrap_or(Val::Null);
            }
            "today" => {
                let d = chrono::Local::now().date_naive().and_hms_opt(0, 0, 0).unwrap();
                return Val::Date(d);
            }
            "now" => return Val::Date(chrono::Local::now().naive_local()),
            _ => {}
        }
    }
    // methods: obj.method(args)
    if let Expr::Member(obj, method) = callee {
        // file.hasProperty("x") / inFolder("dir") / hasTag("a", "b") / hasLink("note") — Obsidian's
        // file functions (Atlas addition: obsidian-web had only hasProperty)
        if matches!(obj.as_ref(), Expr::Ident(i) if i == "file") {
            let plain: Vec<String> = args.iter().map(|e| to_plain(&eval_scoped(e, ctx, scope))).collect();
            let first = plain.first().cloned().unwrap_or_default();
            let names = |field: &str| match ctx.file_field(field) {
                Val::List(l) => l.iter().map(|v| to_plain(v).to_lowercase()).collect::<Vec<_>>(),
                _ => Vec::new(),
            };
            match method.as_str() {
                "hasProperty" => return Val::Bool(ctx.has_property(&first)),
                "inFolder" => {
                    let dir = first.trim_matches('/');
                    let folder = to_plain(&ctx.file_field("folder"));
                    return Val::Bool(dir.is_empty() || folder == dir || folder.starts_with(&format!("{dir}/")));
                }
                "hasTag" => {
                    // a tag matches itself and its nested tags (#a matches #a/b)
                    let tags = names("tags");
                    return Val::Bool(plain.iter().map(|t| t.trim_start_matches('#').to_lowercase()).any(|want| {
                        tags.iter().any(|t| *t == want || t.starts_with(&format!("{want}/")))
                    }));
                }
                "hasLink" => {
                    let want = first.trim_start_matches("[[").trim_end_matches("]]").to_lowercase();
                    let want = want.rsplit('/').next().unwrap_or(&want).trim_end_matches(".md").to_string();
                    return Val::Bool(names("links").contains(&want));
                }
                _ => {}
            }
        }
        // .filter(predicate) keeps the arg unevaluated (uses `value`)
        if method == "filter" {
            let target = eval_scoped(obj, ctx, scope);
            if let Val::List(items) = target {
                if let Some(pred) = args.first() {
                    let kept: Vec<Val> =
                        items.into_iter().filter(|item| eval_scoped(pred, ctx, Some(item)).truthy()).collect();
                    return Val::List(kept);
                }
                return Val::List(items);
            }
            return Val::Null;
        }

        let recv = eval_scoped(obj, ctx, scope);
        let arg0 = args.first().map(|e| eval_scoped(e, ctx, scope));
        return match method.as_str() {
            "isEmpty" => Val::Bool(recv.is_empty()),
            "isNotEmpty" => Val::Bool(!recv.is_empty()),
            "contains" => {
                let needle = arg0.unwrap_or(Val::Null);
                match &recv {
                    Val::List(l) => Val::Bool(l.iter().any(|x| x.eq_val(&needle))),
                    Val::Str(s) => Val::Bool(s.to_lowercase().contains(&to_plain(&needle).to_lowercase())),
                    _ => Val::Bool(false),
                }
            }
            "startsWith" => Val::Bool(to_plain(&recv).starts_with(&to_plain(&arg0.unwrap_or(Val::Null)))),
            "endsWith" => Val::Bool(to_plain(&recv).ends_with(&to_plain(&arg0.unwrap_or(Val::Null)))),
            // `.format("YY.MM-DD")` on a date gives that string, as in Obsidian
            // (Atlas change: obsidian-web kept the Date and reformatted it in its UI).
            "format" => match (recv, arg0) {
                (Val::Date(d), Some(f)) => Val::Str(dates::format(&d, &to_plain(&f))),
                (Val::Date(d), None) => Val::Date(d),
                (other, _) => Val::Str(to_plain(&other)),
            },
            "toString" => Val::Str(to_plain(&recv)),
            "lower" => Val::Str(to_plain(&recv).to_lowercase()),
            "upper" => Val::Str(to_plain(&recv).to_uppercase()),
            _ => Val::Null,
        };
    }
    Val::Null
}

/// Interpret a value as a duration (only string forms like "1 day").
fn as_duration(v: &Val) -> Option<chrono::Duration> {
    match v {
        Val::Str(s) => dates::parse_duration(s),
        _ => None,
    }
}

/// Plain string projection of a value (for concatenation / coercion).
fn to_plain(v: &Val) -> String {
    match v {
        Val::Null => String::new(),
        Val::Bool(b) => b.to_string(),
        Val::Num(n) => {
            if n.fract() == 0.0 {
                format!("{}", *n as i64)
            } else {
                n.to_string()
            }
        }
        Val::Str(s) => s.clone(),
        Val::Link(t) => t.clone(),
        Val::Date(d) => d.format("%Y-%m-%d").to_string(),
        Val::List(l) => l.iter().map(to_plain).collect::<Vec<_>>().join(", "),
        Val::Map(_) => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    struct TestCtx {
        props: BTreeMap<String, Val>,
    }

    impl TestCtx {
        fn new(pairs: &[(&str, Val)]) -> Self {
            TestCtx { props: pairs.iter().map(|(k, v)| (k.to_string(), v.clone())).collect() }
        }
    }

    impl Context for TestCtx {
        fn file_field(&self, name: &str) -> Val {
            match name {
                "name" => Val::Str("Sample".into()),
                "folder" => Val::Str("notes".into()),
                "tags" => Val::List(vec![Val::Str("physics/dmft".into())]),
                "links" => Val::List(vec![Val::Link("Hubbard".into())]),
                _ => Val::Null,
            }
        }
        fn property(&self, name: &str) -> Val {
            self.props.get(name).cloned().unwrap_or(Val::Null)
        }
        fn has_property(&self, name: &str) -> bool {
            self.props.contains_key(name)
        }
        fn formula(&self, _name: &str) -> Val {
            Val::Null
        }
        fn this_field(&self, _name: &str) -> Val {
            Val::Null
        }
    }

    fn run(src: &str, ctx: &dyn Context) -> Val {
        eval(&parse(src).unwrap(), ctx)
    }

    #[test]
    fn arithmetic_and_comparisons() {
        let ctx = TestCtx::new(&[]);
        assert!(run("1 + 2 == 3", &ctx).truthy());
        assert!(run("2 * 3 > 5", &ctx).truthy());
        assert!(!run("1 > 2", &ctx).truthy());
    }

    #[test]
    fn boolean_operators() {
        let ctx = TestCtx::new(&[]);
        assert!(run("true && true", &ctx).truthy());
        assert!(!run("true && false", &ctx).truthy());
        assert!(run("false || true", &ctx).truthy());
        assert!(run("!false", &ctx).truthy());
    }

    #[test]
    fn property_access_and_methods() {
        let ctx = TestCtx::new(&[
            ("status", Val::Str("active".into())),
            ("tags", Val::List(vec![Val::Str("a".into()), Val::Str("b".into())])),
        ]);
        assert!(run("status == \"active\"", &ctx).truthy());
        assert!(run("status.startsWith(\"act\")", &ctx).truthy());
        assert!(run("tags.contains(\"a\")", &ctx).truthy());
        assert!(!run("tags.isEmpty()", &ctx).truthy());
    }

    #[test]
    fn file_has_property() {
        let ctx = TestCtx::new(&[("status", Val::Str("x".into()))]);
        assert!(run("file.hasProperty(\"status\")", &ctx).truthy());
        assert!(!run("file.hasProperty(\"missing\")", &ctx).truthy());
        assert!(run("file.inFolder(\"notes\")", &ctx).truthy(), "the folder itself");
        assert!(run("file.inFolder(\"\")", &ctx).truthy(), "the root holds everything");
        assert!(!run("file.inFolder(\"note\")", &ctx).truthy(), "not a prefix of the name");
        assert!(run("file.hasTag(\"physics\")", &ctx).truthy(), "nested tag physics/dmft");
        assert!(run("file.hasTag(\"x\", \"#Physics\")", &ctx).truthy(), "any of, case-insensitive");
        assert!(!run("file.hasTag(\"phys\")", &ctx).truthy());
        assert!(run("file.hasLink(\"Hubbard\")", &ctx).truthy() && !run("file.hasLink(\"Other\")", &ctx).truthy());
    }

    #[test]
    fn malformed_input_surfaces_as_err() {
        // a dangling open paren must return Err, not panic
        assert!(parse("(").is_err());
        assert!(parse("1 + ").is_err());
    }
}

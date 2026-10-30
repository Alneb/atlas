//! What a share or a selection brings into a capture box as text: the desktop box's and the phone's one rule.

/// Text as a Markdown quote, line by line (a blank line stays a bare `>`).
pub fn quote(t: &str) -> String {
    t.lines().map(|l| if l.trim().is_empty() { ">".to_string() } else { format!("> {l}") }).collect::<Vec<_>>().join("\n")
}

/// A share's text, its subject first when the text does not already hold it (a page's title before its address).
pub fn with_subject(subject: &str, text: &str) -> String {
    if text.is_empty() {
        subject.to_string()
    } else if subject.is_empty() || text.contains(subject) {
        text.to_string()
    } else {
        format!("{subject}\n{text}")
    }
}

/// A share never replaces an unsent draft (leaving would then save over it): it goes under the draft.
pub fn under_draft(draft: &str, shared: &str) -> String {
    if shared.is_empty() {
        draft.to_string()
    } else if draft.trim().is_empty() {
        shared.to_string()
    } else {
        format!("{}\n{shared}", draft.trim_end())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_share_goes_under_a_draft_with_its_subject_first() {
        assert_eq!(with_subject("Dune", "https://example.org/dune"), "Dune\nhttps://example.org/dune");
        assert_eq!(with_subject("Dune", "Dune https://example.org/dune"), "Dune https://example.org/dune");
        assert_eq!(with_subject("Dune", ""), "Dune");
        assert_eq!(under_draft("call the lab\n", "https://example.org/x"), "call the lab\nhttps://example.org/x");
        assert_eq!(under_draft("  ", "https://example.org/x"), "https://example.org/x");
        assert_eq!(under_draft("call the lab", ""), "call the lab");
        assert_eq!(quote("spin liquid\n\nground state"), "> spin liquid\n>\n> ground state");
    }
}

<script lang="ts">
  // A sample of what the look settings change: drawn with the same variables as notes and code, so
  // it updates the moment a setting does.
</script>

<section class="settings-panel preview" aria-label="Preview">
  <div class="note">
    <h4>Hubbard model, cluster DMFT</h4>
    <p>Each site couples to a bath; the <a href="#preview" onclick={(e) => e.preventDefault()}>self-energy</a> is local to the cluster. <mark>Highlighted</mark> and <code>inline code</code>, <span class="tag">#dmft</span>.</p>
  </div>
  <pre class="code"><span class="kw">fn</span> <span class="fn">hop</span>(t: <span class="ty">f64</span>) -&gt; <span class="ty">f64</span> {"{"} t * <span class="num">0.5</span> {"}"} <span class="cm">// code font</span></pre>
  <div class="ui"><button class="primary">Primary</button><span class="sel">selected text</span><span class="muted">interface text</span></div>
</section>

<style>
  .preview { display: flex; flex-direction: column; gap: 10px; padding: 14px 18px !important; }
  .note { font-family: var(--prose-font, var(--font-ui)); font-size: var(--prose-size, 15px); line-height: var(--prose-line-height, 1.68); max-width: var(--prose-width, none); color: var(--text); }
  .note h4 { margin: 0 0 4px; color: var(--heading); font-size: 1.3em; }
  .note p { margin: 0; }
  .note a { color: var(--link); }
  mark { background: var(--highlight-bg); color: inherit; border-radius: 3px; padding: 0 2px; }
  .note code { font-family: var(--code-font, var(--font-mono)); color: var(--inline-code); background: var(--code-bg); border-radius: 4px; padding: 0 4px; font-size: .9em; }
  .tag { background: var(--tag-bg); color: var(--tag-color); border-radius: 999px; padding: 0 7px; font-size: .9em; }
  .code { margin: 0; padding: 8px 12px; background: var(--code-bg); border-radius: var(--radius-sm); font-family: var(--code-font, var(--font-mono)); font-size: var(--code-size, 14px); color: var(--syn-variable); }
  .kw { color: var(--syn-keyword); } .fn { color: var(--syn-function); } .ty { color: var(--syn-type); } .num { color: var(--syn-number); } .cm { color: var(--syn-comment); }
  .ui { display: flex; gap: 12px; align-items: center; }
  .primary { background: var(--accent); color: var(--accent-fg); padding: 4px 12px; border-radius: var(--radius-sm); font-weight: 600; }
  .sel { background: var(--accent-sel); padding: 0 3px; }
  .muted { color: var(--text-muted); }
</style>

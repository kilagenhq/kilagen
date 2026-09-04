# No deployment

Nothing is written into the instance. Run the framework yourself:

```bash
kilagen check          # every check: frontmatter, refs, reviews, artifacts
kilagen build          # regenerate the committed artifacts and the site
kilagen serve          # browse it locally
```

Pick this when your CI is not one of the supported platforms, or when the
program lives on a laptop and has no CI at all.

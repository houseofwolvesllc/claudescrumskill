---
name: spec
description: Transform a rough prompt into a comprehensive specification document. Analyzes requirements, extracts key information, and produces a structured spec saved to .claude-scrum-skill/specs/. Use when planning a new feature or task before implementation.
---

# Spec Sheet Creator

This skill takes a user's rough prompt and transforms it into a comprehensive specification document following best practices for Claude Code development.

## Input

The following user input will be processed:

$ARGUMENTS

## Instructions

As Claude Code, your task is to transform the user's rough prompt into a comprehensive and well-structured specification document. Follow these steps:

1. **Analyze the Prompt**: Carefully examine the user's input to understand the core requirements, constraints, and goals.

2. **Extract Key Information**:
   - Core functionality/features
   - User requirements and expectations
   - Technical constraints or requirements
   - Success criteria or acceptance criteria
   - Potential edge cases or challenges

3. **Structure the Specification**: Create a comprehensive spec sheet using the template in `templates/spec-template.md` in this skill's directory.

4. **Enhance Clarity**: For each section:
   - Use clear, specific language
   - Prioritize requirements when possible
   - Provide examples to illustrate complex points
   - Highlight potential challenges or decisions needing attention

5. **Format for Comprehension**:
   - Use markdown formatting for readability
   - Include tables and lists where appropriate
   - Add code examples if they help illustrate requirements
   - Structure the document with clear headings and subheadings

## Design Passes (Baseline, Domain & Patterns)

Before finalizing, run these passes so the spec is grounded in the project's
engineering standards. They shape the spec at **design time**; implementation-time
enforcement is `/project-orchestrate`'s job.

6. **Engineering baseline.** Read `../shared/references/ENGINEERING_BASELINE.md`
   (Clean Code, Test-Driven Development, the simple-design Arbitration Rule). The
   spec must assume this baseline: acceptance criteria assume tests-first
   (red-green-refactor), and every proposed design assumes the Arbitration Rule
   — the simplest thing that works, no anticipatory abstraction.

7. **Strategic domain pass (DDD).** For each epic, capture the domain's
   **ubiquitous language** and **classify its subdomain** as one of `core`,
   `supporting`, or `generic`:
   - `core` — the complex business heart with real invariants; warrants tactical
     domain modeling.
   - `supporting` — necessary but not differentiating.
   - `generic` — CRUD, plumbing, off-the-shelf concerns.

   Record the classification on each epic (see the JSON sibling below). It is the
   single authoritative source `/project-orchestrate` reads to decide which epics
   receive situational guidance — so classify carefully and do **not** expect
   downstream skills to re-derive it. For `core` epics, sketch candidate
   aggregates, entities vs. value objects, and where key business rules live,
   consistent with the `domain-modeling` skill.

8. **Pattern-naming pass (GoF), candidate only.** Identify axes of *expected
   variation* and, where one is real, name a **candidate** Gang of Four pattern.
   Every named pattern MUST follow this form and stay non-binding:

   > `Pattern — because <real axis of variation>; revisit at build (may collapse
   > to a function or simpler form if the variation does not materialize)`.

   Do not name patterns speculatively or for CRUD/generic work. A spec is not a
   pattern shopping list — naming records a justified hypothesis, not a mandate.

## Filename Convention

Read the specs output path from `../shared/config.json` (key: `paths.specs`,
default: `.claude-scrum-skill/specs`).

Save the output spec to `<specs-path>/YYYYMMDD_hhmmss_{name}.md` where the timestamp is in YYYYMMDD*hhmmss format in **US Pacific Time (PST/PDT)** and `{name}` is a snake_case name that succinctly describes the feature or project. To get the current Pacific time, run `TZ='America/Los_Angeles' date '+%Y%m%d*%H%M%S'` via the Bash tool.

### Schema-Validated Sibling Output (v2.0.0+)

In addition to the markdown spec document, write a sibling JSON file at `<specs-path>/YYYYMMDD_hhmmss_{name}.spec.json` conforming to `SpecSchema` (`<skills-root>/_workflows/schemas/SpecSchema.json`). Required fields:

```json
{
  "title": "<spec title>",
  "overview": "<one-paragraph overview>",
  "objectives": {
    "primary": ["..."],
    "secondary": ["..."]
  },
  "epics": [
    {
      "name": "<epic name>",
      "slug": "<kebab-case>",
      "description": "<one-paragraph>",
      "subdomain": "core | supporting | generic",
      "depends_on": [],
      "shared_design_concerns": [],
      "slice": { "start_line": 0, "end_line": 0 }
    }
  ],
  "dependencies": ["..."],
  "design_concerns": ["..."]
}
```

The JSON sibling lets downstream skills (`/project-scaffold` especially) consume the spec via schema-validated direct access rather than re-parsing the markdown. Both files MUST be produced; the markdown remains the human-readable canonical document.

## Guidelines for Success

1. **Be Specific**: Avoid vague requirements; provide concrete details.
2. **Be Comprehensive**: Cover all aspects of the feature without assuming implicit knowledge.
3. **Be Practical**: Ensure the spec is implementable with the existing codebase.
4. **Be Forward-Thinking**: Consider future extensions and maintenance.
5. **Be Clear**: Use unambiguous language that prevents misinterpretation.

The goal is to produce a specification document that serves as a complete blueprint for implementing the requested feature with minimal ambiguity or need for clarification.

Do not modify any files in the codebase other than creating the specification document.

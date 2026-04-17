---
name: spec
description: Transform a rough prompt into a comprehensive specification document. Analyzes requirements, extracts key information, and produces a structured spec saved to .claude-scrum-skill/specs/. Use when planning a new feature or task before implementation.
---

# Spec Sheet Creator

This skill takes a user's rough prompt and transforms it into a comprehensive specification document following best practices for Claude Code development. ultrathink

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

## Filename Convention

Read the specs output path from `../shared/config.json` (key: `paths.specs`,
default: `.claude-scrum-skill/specs`).

Save the output spec to `<specs-path>/YYYYMMDD_hhmmss_{name}.md` where the timestamp is in YYYYMMDD*hhmmss format in **US Pacific Time (PST/PDT)** and `{name}` is a snake_case name that succinctly describes the feature or project. To get the current Pacific time, run `TZ='America/Los_Angeles' date '+%Y%m%d*%H%M%S'` via the Bash tool.

## Guidelines for Success

1. **Be Specific**: Avoid vague requirements; provide concrete details.
2. **Be Comprehensive**: Cover all aspects of the feature without assuming implicit knowledge.
3. **Be Practical**: Ensure the spec is implementable with the existing codebase.
4. **Be Forward-Thinking**: Consider future extensions and maintenance.
5. **Be Clear**: Use unambiguous language that prevents misinterpretation.

The goal is to produce a specification document that serves as a complete blueprint for implementing the requested feature with minimal ambiguity or need for clarification.

Do not modify any files in the codebase other than creating the specification document.

# hGATE
human Guided AI assisted Traceable Engineering

Presentation : https://docs.google.com/presentation/d/1Rlt7gmf7c9DqZFTiga4myCYpJbLtBvQvo3i-W0Aq9dw/edit?slide=id.g3f455ea9a55_0_95#slide=id.g3f455ea9a55_0_95

Video Recording : https://www.youtube.com/watch?v=oNJZR_BFW-c

## Skills

Start new problem discovery with `domain-exploration`. It guides an interactive,
confirmation-gated discussion to determine whether the requirement belongs to
one bounded context or multiple bounded contexts. Its confirmed output is then
used as input to a separate `bc-refinement` session for each affected BC.

Use `architecture-decision-exploration` when the remaining uncertainty is about
technical or cross-system architecture rather than business boundaries.

hGATE should not be treated as an all-or-nothing process. If I'm building a weekend project, an internal tool, or a quick MVP, I probably wouldn't go through every phase. The overhead wouldn't be justified.

Where I think it starts paying for itself is when one or more of these become true:

- The project is expected to live for years.
- Multiple engineers (or AI agents) are working in parallel.
- Business rules are evolving frequently.
- The cost of regressions starts becoming significant.

At that point, the challenge isn't that the AI can't write code—it absolutely can. The challenge becomes keeping humans, AI sessions, and evolving business requirements aligned over time. That's the problem I'm trying to solve with hGATE.

I also agree that current LLMs do an impressive job on small to medium codebases. For a solo developer working on a contained project, a lot of this process would feel unnecessary. But once the project grows, I've found the problem shifts from "Can the AI generate code?" to "Can everyone consistently generate the right code six months later?" That's where things like BDD, skill files, decision logs, and ghost-behavior checks become valuable.

There is a lot of social media theatrics on speed of delivery stating 20 or so PRs a day, this process doesn't seem to provide that velocity.
Regarding people shipping 20 PRs a day, I don't think that's inherently a bad thing. If their context allows it, that's great. But I also don't think PR count is the right metric. I'd rather optimize for time to reliable change than number of changes. If a little more upfront thinking saves multiple review cycles, regressions, or rework later, the overall throughput can actually improve.
Software development isn't a sprint measured by GitHub activity. It's measured by time to reliable change.

On the "code quality doesn't matter until product-market fit" point, I mostly agree as well. I don't think early-stage startups need enterprise architecture or excessive process. But I also think there's a difference between gold-plating code and having clear specifications. Most of what hGATE tries to improve isn't code quality for its own sake—it's making sure humans and AI share the same understanding of the business behavior before implementation starts.

*What hGate actually optimizes*
it's about reducing entropy in software projects.

The AI is simply the catalyst.

The framework is really preventing:

- forgotten decisions
- contradictory requirements
- duplicated business rules
- ghost behavior
- context drift
- tribal knowledge

Those problems existed long before LLMs. LLMs just make them appear sooner because they amplify both good and bad specifications.

During our discussions with different teams, we have realized that hGATE probably needs different maturity levels instead of assuming every project follows the same workflow. Something like:

Lite for prototypes and MVPs.
Standard for typical team projects.
Enterprise for long-lived systems where governance and consistency matter.

I think that's a much more realistic way to position it than saying everyone should always use the full process.

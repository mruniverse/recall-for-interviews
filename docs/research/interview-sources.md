# Official Public Sources: Software Engineer Interview Topics

Scope: public official pages from Amazon, Microsoft, and Google that describe software engineer interview topics or preparation. Collected by reading the pages directly (curl) on 2026-11-26 (UTC-03).

Evidence rules used in this document:
- **scope = topic**: the page lists topics or skills. It is not evidence of concrete interview questions or their frequency.
- **scope = question-pattern**: the page shows a question type or example. No source in this catalog provided a concrete question with a verified frequency.
- No question frequencies are claimed. No paid or NDA question banks were used.

## Summary

| # | Company | Verified | Scope | Consulted |
|---|---------|----------|-------|-----------|
| 1 | Amazon | Yes | topic | 2026-11-26 |
| 2 | Amazon | Yes | topic (behavioral) | 2026-11-26 |
| 3 | Microsoft | Yes | topic | 2026-11-26 |
| 4 | Microsoft | Yes | topic / process guidance | 2026-11-26 |
| 5 | Google (Grow with Google) | Yes | topic / process guidance (not SWE-specific) | 2026-11-26 |
| - | Meta | No | none verified | - |

Verified sources: 5 of up to 6. Meta: no official page with interview content could be read (see Limits).

---

## 1. Amazon Software Development Interview Topics

- **URL:** https://amazon.jobs/content/en/how-we-hire/interview-prep/software-development-topics
- **Title:** Amazon Software Development Interview Topics
- **Consulted:** 2026-11-26 (HTTP 200, via curl)
- **Scope:** topic
- **Excerpt:** "Most technical interviews require you to perform coding and system design white boarding exercises." Listed topics: "Programming language, Data structures, Algorithms, Coding, Object-oriented design, Databases, Distributed computing, Operating systems, Internet topics, General machine learning and artificial intelligence."
- **Limit:** Lists topics only. The page says interviewers look for applying knowledge, not memorization. It contains no concrete questions and no frequencies. The coding assessment and video samples are linked but were not read as text.

## 2. Amazon Leadership Principles

- **URL:** https://www.amazon.jobs/content/en/our-workplace/leadership-principles
- **Title:** Leadership Principles
- **Consulted:** 2026-11-26 (HTTP 200, via curl)
- **Scope:** topic (behavioral)
- **Excerpt:** "Customer Obsession: Leaders start with the customer and work backwards." "Ownership: Leaders are owners." "Invent and Simplify." "Are Right, A Lot." "Learn and Be Curious." "Hire and Develop the Best."
- **Limit:** These are company values used in behavioral evaluation. The page does not provide interview questions. Only the first six principles were read in full text.

## 3. Microsoft Technical Interviewing

- **URL:** https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing
- **Title:** Technical interviewing | Microsoft Careers
- **Consulted:** 2026-11-26 (HTTP 200, via curl)
- **Scope:** topic
- **Excerpt:** "Algorithms: ... You should know the details of at least one n*log(n) sorting algorithm, preferably two (for example, quicksort and merge sort)." "Data structures: arrays and strings, queues and lists, linked lists, trees/tries, hash maps/hash sets, graphs." "System design and distributed systems: ... Resiliency, high availability, auto-scaling, replication, CAP theory, partitioning, all may be included."
- **Limit:** The page says the list "simply gives examples and is representative, not exhaustive." It is a topic list, not a question list. Coding and AI/ML sections were not used in this catalog.

## 4. Microsoft Interview Tips

- **URL:** https://careers.microsoft.com/v2/global/en/hiring-tips/interview-tips.html
- **Title:** Interview tips | Microsoft Careers
- **Consulted:** 2026-11-26 (HTTP 200, via curl)
- **Scope:** topic / process guidance
- **Excerpt:** "Prepare specific examples from your experience that explain the situation, what you did, the outcome, and what you learned." "You may also be asked how you would approach a role-related task or scenario."
- **Limit:** General process guidance for all roles. It states that some roles include coding exercises but gives no examples. Not evidence of question content or frequency.

## 5. Grow with Google: How to Prepare for an Interview

- **URL:** https://grow.google/grow-your-career/articles/interview-tips/
- **Title:** How to Prepare for an Interview | Grow with Google
- **Consulted:** 2026-11-26 (HTTP 200, via curl; the canonical URL of the source link is grow.google/certificates/interview-warmup/, which redirects to this page)
- **Scope:** topic / process guidance
- **Excerpt:** "Why interview preparation matters... four different categories of questions you're likely to be asked: 'tell me about yourself' questions, behavioral questions, situational questions, and more general or personality-based questions." "Answer behavioral questions using the STAR method."
- **Limit:** General career guidance, not specific to software engineers. The categories are described, but no SWE-specific questions or frequencies are given.

---

## Follow-up

The linked official coding-sample transcripts were subsequently retrieved. See [Amazon coding examples](amazon-coding-examples.md) for two official demonstration patterns, their excerpts and limits. The five pages above remain topic/process evidence only; no question frequency is claimed.

## Gaps and Limits

- **Meta:** No official Meta Careers page with software engineer interview content was readable. metacareers.com returned a login redirect and a 404 on the tested paths, and web search returned no results. Meta is not represented.
- **Google careers:** The "Interviewing at Google" and "How we hire" pages (google.com/about/careers/applications/) are JavaScript-rendered. curl returned almost no text, so they were not used.
- **Microsoft career pages with embedded app data:** apply.careers.microsoft.com returned application-shell content, not interview guidance.
- **web_extract:** Unavailable in this run (backend error). All pages were read with curl. Text was extracted with regex-based HTML stripping, so layout and link text may be lost.
- No page in this catalog provides concrete interview questions, so no question-pattern evidence is claimed.
- These sources do not measure question frequency, difficulty, or current hiring practice.

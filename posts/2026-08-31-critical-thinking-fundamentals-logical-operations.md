---
title: Critical Thinking Fundamentals - Logical Operations
serious: false
lecture: true
date: 2026-08-31T09:46:00Z
author: Sufian M′Barki
summary: With the introduction of Conjunctions and Disjunctions, it is time to
  dive deeper into the realm of logical operations.
tags:
  - lecture
  - logic
  - journalism
  - israel
  - antisemitism
---
![Critical Thinking Fundamentals - Logical Operations](/static/img/ctf3lo.png "Critical Thinking Fundamentals - Logical Operations")

The principles of categorical reasoning demonstrated the nature of deductive argumentation - where a conclusion about the particular follows from the whole. Conditional reasoning, on the other hand, showcased that oftentimes, consequents can only be true when one or more antecedents (prerequisites) are true as well.

[In the last seminar,](https://thewaspalloy.org/posts/critical-thinking-fundamentals-conditional-reasoning-seminar/#logical-operations-in-conditional-syllogisms) we explored two logical operations in conditional syllogisms - conjunctions and inclusive disjunctions. This time, we are going to take a look at additional operations, continuing off disjunctions.

## Inclusive and Exclusive Disjunctions

### Inclusive Disjunctions

As established before, **Inclusive Disjunctions** are a type of logical operation where only one of multiple sufficient conditions need to be true in order for their associated consequent to be true.

1. **Major Premise:** Expressing hatred toward Jewish traditions $(A)$ is antisemitism $(Q)$.
2. **Major Premise:** Excluding Jewish people from events or activities on grounds of their ethnicity and religion $(B)$ is antisemitism $(Q)$.
3. **Minor Premise:** Julian did not invite Lior to his party because the latter is Jewish ($B$ is true).
4. **Conclusion: Julian is antisemitic ($Q$ is true).**

In this syllogism, we can see that the truthfulness of only one of these two sufficient conditions - $B$ - leads to the consequent $Q$ of antisemitism. The same would be the case if $A$ were true:
1. **Minor Premise:** Julian ridiculed Lior for wearing his Kippah, comparing it to an "ugly hat." ($A$ is true).
2. **Conclusion: Julian is antisemitic ($Q$ is true).**

The inclusive disjunction can be portrayed with the following logical formula:

$$A \lor B \rightarrow Q$$

With text: **Either A or B leads to Q.**

In computer science, this logical operation is labeled **OR.**

### Exclusive Disjunctions & Negations

In **Exclusive Disjunctions,** the following rules come into play. In order for the consequent $Q$ (or one of various consequents) to be true:
1. $A$ and $B$ cannot be false at the same time.
2. Either $A$ or $B$ can be true at a time, but both cannot be true simultaneously.

If $A$ is true, then $B$ is false. This is marked with a **Negation Sign** in logical operations:
$$A \rightarrow \neg B$$

For our first example, we will take a look at military logic:
1. **Major Premise:** An individual present in an active warzone can either be a combatant $(C)$ or a civilian $(N)$, but they cannot be both at the same time $(C \oplus N)$.
2. **Minor Premise:** An armed, masked individual in [Azzah](https://thewaspalloy.org/posts/the-indigenous-name-of-the-city-of-gaza/) is shooting at IDF soldiers ($C$ is true).
3. **Conclusion: The masked individual is not a civilian non-combatant $(\neg N)$.**

It does not matter what the masked person's affiliation is - whether they are a Hamas terrorist, a PIJ terrorist, an actor from another terrorist faction, or a private fringe individual. They are not a civilian non-combatant if they open fire at the Israel Defense Forces.

The formula is:
$$C \rightarrow \neg N$$

We can demonstrate another exclusive disjunction using a familiar example from the real world:
1. **Major Premise:** In a coin flip, heads $(H)$ represents painting my nails black $(Q)$.
2. **Major Premise:** In the same framework, tails $(T)$ means I will paint my nails white $(W)$.
3. **Minor Premise:** After tossing my coin, I got tails ($T$ is true).
4. **Conclusion: I will paint my nails white ($W$ is true).**

Notice the following logic - without ever flipping my coin, I cannot get either heads or tails, meaning I don't get to decide what color to paint my nails within that framework. Meanwhile, it is impossible to get two results from a single coin flip, and I cannot choose to paint my nails black and white at the same time.

The logical formula for this exclusive disjunction is as follows:
$$(H \rightarrow Q) \land (T \rightarrow W) \land (H \oplus T) \rightarrow (Q \oplus W)$$

In text: **If H leads to Q, and T leads to W, and strictly either H or T occurs at a time, then strictly either Q or W will result.**

This exclusive disjunction has two conditions leading to two different results, neither of which can ever exist simultaneously. You have only one condition, and strictly only one result.

If both $H$ and $T$ are false, you cannot get $Q$ nor $W$ as a result:

$$\neg H \land \neg T \rightarrow \neg Q \land \neg W$$

Or:

$$\neg (H \lor T) \rightarrow \neg (Q \lor W)$$

Both formulas here are correct and communicate the same idea: **If H and T are both false simultaneously (if neither H nor T occurs), then they will not result in Q nor W.**

## Logical Contradictions

A **Contradiction** occurs when any statement asserts that a proposition is both true and false at the exact same time, in the exact same respect:
**P and Not-P** is the formula for a contradiction: $P \land \neg P$

**Logical Axiom: A contradiction is always false under every possible circumstance.**

We can take a look at an example contradiction:
1. Let $P =$ *"Hamza is a citizen of Israel."*
2. Therefore $\neg P =$ *"Hamza is not a citizen of Israel."*
3. **Contradiction:** *"Hamza is a citizen of Israel, and Hamza is not a citizen of Israel."* $(P \land \neg P)$

Two other examples I can immediately think of come from gaming pop culture and one of my serious articles on The Wasp Alloy.

In **Genshin Impact,** when the Dendro Archon Nahida demands that the Fatui Harbinger Dottore explain why he has shown up at the Sanctuary of Surasthana, given he had allegedly already left Sumeru, he responds with a contradiction on purpose.

He infamously states: "I left Sumeru ($P$), but I also stayed in Sumeru $(\neg P)$."

Of course, the in-universe explanation is that he used to have several clones of himself performing inhumane experiments across the entire world. One of his clones did leave Sumeru to create this illusion, but another remained.

The reason this example is so important is that it demonstrates how bad-faith actors can purposefully employ contradictions in an attempt to confuse those around them and deceive them with hidden variables. The statement only got resolved because Dottore's linguistic trick was eventually revealed.

## Proof by Contradiction *(Reductio ad Absurdum)*

The second example is from the article ["Large Language Models Burn Propallies to Pieces."](https://thewaspalloy.org/posts/large-language-models-burn-propallies-to-pieces/#:~:text=Schr%C3%B6dinger%27s%20Gaza) We can use it to explore a rhetorical tactic in logical discourse known as **Reductio ad Absurdum.** It translates to "reduction to absurdity," and I employ it very often as a writer and activist.

Below is one of my favorite terms in Hasbara activism, specifically because it's so damn hilarious:

> *[Gemini](https://gemini.google.com/app) once described worldwide antisemitism and the narratives surrounding it as **Schrödinger's Gaza:** both "destroyed" and "genocided," yet thriving with a brand new bustling "Nova Restaurant" named after October 7th, complete with regular customers! That is the fucking equivalent of calling your new Green Deli "Shoah Holocaust Café" by the way.*

During a supposed active genocide in Azzah - one that is described as "mindless destruction," it would be impossible for the Arab population to open restaurants with revolting and inflammatory themes, gyms, supermarkets, and so on.

Azzah is either destroyed $(P)$ or it isn't $(\neg P)$. It cannot be both at the same time $(P \land \neg P)$.

The actual truth is that a large portion of the Northern Azzah Strip is destroyed. However, what people tend to withhold from the public is that the IDF are actually **demolishing terrorist infrastructure,** not your average civilian settlements[<sup>[1]</sup>](#cite-1)[<sup>[2]</sup>](#cite-2). Deleting terrorists and their bases while actively saving civilians and providing them with humanitarian aid is not "genocide," nor is it indiscriminate "destruction."

## Moving Forward

In the upcoming seminar, we will explore even more detailed examples of these logical operations, such as double negations and equivalences, fallacies (unsound and invalid operations), and more.

***Sufian M'Barki***

***

## Citations

**[1]** <span id="cite-1"></span> There is no genocide in Azzah carried out by the IDF nor Israel:
- [Detailed Pastebin document providing a library of sources and supporting evidence on the history of Israel and Middle-Eastern conflicts](https://pastebin.com/uTT91J3B)
- [Perplexity summarizing all documented evidence proving Israel's ethical military conduct, including ICJ court ruling in 2024](https://www.perplexity.ai/search/there-is-a-lot-of-misinformati-9usKQ3yOTIGOUzXUE9if1w#0)
- [Tweet by Ahmad Taha showcasing how AI is used in modern antisemitic propaganda to mislead viewers](https://fixupx.com/amjadt25/status/1983959827052425436)
- [Mosab Hassan Yousef recounting "Hamas disciplining" from childhood, proving it is Hamas' side perpetuating violence against Jews](https://share.google/aimode/SZKaMhSLNoCmKk5I3)
- [Open-Source Intelligence has gathered satellite footage showcasing blood splotches in places with actual ongoing atrocities and genocides, such as Nigeria and Sudan - a phenomenon completely absent in Azzah, where only structural destruction can be seen](https://www.perplexity.ai/search/2caa67ee-a731-438e-a15c-719e1f74e0a0)

**[2]** <span id="cite-2"></span> The IDF have consistently organized humanitarian corridors in Azzah for non-combatants:
- [Detailed Gemini summary quoting numerous sources showcasing the established corridors and procedures in 2023, 2024, 2025, and 2026](https://share.gemini.google/ZSCw9SKJeYfZ)
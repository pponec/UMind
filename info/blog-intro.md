<!--
Draft of a dev.to article about UMind, told through one example: planning a trip.

The two pictures live next to this file:

  img-edit.png    — editing mode
  img-graph.png   — presentation mode

Before publishing, upload both with the dev.to image button and replace the
paths with the URLs dev.to returns.

Suggested tags: #showdev #javascript #productivity #opensource
-->

# A new lightweight mind-map app, shown on the example of planning a trip

A mind map is one idea in the middle and everything that hangs off it around:
a topic, its main branches, and the details growing out of those. Behind the
picture there is nothing more exotic than a tree — a root, its children, and
their children — which happens to be the shape most of our notes already have
before we flatten them into a document.

**UMind** is a small application for writing that tree down. Each node holds a
short title, the kind you can read at a glance, and optionally a longer
description underneath it: a paragraph of reasoning, a table of prices, a link,
a checklist — anything you would otherwise scribble in the margin and lose.

It is, quite literally, a static HTML page. There is no backend and no
telemetry: nothing you type leaves your computer, because there is nowhere for
it to be sent. That has two pleasant consequences. Nothing needs to be
installed — you open the page, or you copy a folder of six files onto your own
web space, an intranet share or a USB stick, and it works offline afterwards.
And nobody needs to register: no account, no password, no confirmation e-mail,
because there is no server that could hold an account in the first place. Your
maps are auto-saved in the browser, and *Save* / *Open* move them to and from
plain `.json` files that belong to you.

The other principle is the keyboard. Typing a thought should not require aiming
at anything, so a new node is <kbd>Enter</kbd>, a level deeper is <kbd>Tab</kbd>,
a level back is <kbd>Shift</kbd>+<kbd>Tab</kbd>, and the description of the
current node opens with <kbd>Alt</kbd>+<kbd>Enter</kbd>. The mouse is welcome
but never necessary. And because writing and showing are two different
activities, the same document has two modes: an **editing mode**, where the map
is an outline you type into, and a **presentation mode**, where it becomes the
picture you show to somebody else.

## Editing mode: how a plan actually forms

![UMind in editing mode: the trip outline on the left, the description of the selected node on the right](img-edit.png)

Suppose the weekend away has just been agreed and nothing else has. The
destination becomes the root, and instead of collecting links straight away it
pays to write down the five questions the trip will keep asking: how do we get
there, where do we sleep, what do we want to see, where do we eat, and what has
to be done before we leave. That takes half a minute and gives the map its
shape; every answer found later already has a place waiting for it.

The answers arrive out of order, as they always do. A colleague mentions that
the old bridge is worth seeing at sunrise, so that becomes a child of *What to
see* — and the reason why sunrise, which is the part one forgets, goes into its
description. Comparing the train, the night bus and the flight ends up as a
small table in the description of *Getting there*, together with the single
sentence that settles it: the train wins because it runs city centre to city
centre. A week later the table is still there, so nobody has to re-open five
tabs to remember why the €19 night bus was rejected.

The outline itself keeps moving while this happens. *Beer garden by the river*
starts life under sightseeing and quietly migrates to *Food & drink*;
<kbd>Alt</kbd>+<kbd>↑</kbd> reorders siblings when it turns out food matters more
than castles; a settled branch can be folded away so the unsettled ones get the
attention. The titles stay skimmable, the research stays reachable, and the
plan stops living in six different places at once.

## Presentation mode: the same document as a picture

![The same map in presentation mode: the root in the centre, branches to both sides, descriptions drawn as notes](img-graph.png)

Nobody else wants to read your outline, so one button turns it into a mind map:
the topic in the middle, branches fanning out to both sides, and every
description drawn as a note beside the node it belongs to — rendered Markdown,
tables and links included. The layout is computed, so there is nothing to drag
into place, and the result can be downloaded as a single SVG file that opens in
any browser, on any phone, and prints without turning grey.

That is the whole exchange: the person who has no interest in your tooling gets
one picture, while you keep the editable original as one small file.

## What it adds up to

A mind map is not the deliverable — the decision is. UMind is built around that
idea: the outline is where the thinking happens, the picture is what you hand
over, and both are just files you own. No account to create, no service to trust,
nothing to install, nothing that stops working when a company changes its plans.
The trip, incidentally, was excellent, and it rained on Saturday exactly as the
map predicted.

If you would like to try it, the guided welcome map is at
[pponec.github.io/UMind/?welcome](https://pponec.github.io/UMind/?welcome) and
the source — vanilla JavaScript, no framework, no build step, Apache 2.0 — is on
[GitHub](https://github.com/pponec/UMind).

And I am curious about the other half of the story: where does *your* half-formed
plan live right now — in an app, in a text file, or in a chat thread you keep
scrolling back through?

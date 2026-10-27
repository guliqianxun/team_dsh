# Team DSH

[中文](README.zh-CN.md)

A floating history-review pet inside DSH. Click the pet, find conversations by title, select one to three, then start a review. DSH shows the result in a new native conversation where you can ask follow-up questions. Source conversations stay unchanged.

The default is the community whale-girl illustration. Open Appearance to choose the cat or a local PNG, JPEG, or WebP image up to 1 MiB. The choice stays in this browser after refresh; clearing site data resets it. Images are not sent to the model.

Native references capture history when the message starts processing. Compacted or long conversations may supply summaries or partial content. The review starts with work and observed outcomes, then covers effective approaches, friction, and up to three evidence-backed improvements. Outcomes distinguish user confirmation, assistant reports, and unverified claims. Each suggestion names when to apply it, what to do, and how to check the next comparable task; a copyable prompt or project-instruction draft is included only when supported. Short or inconclusive histories receive a short review without invented patterns. Reviews use the instance’s default model and native permissions in the dedicated Team DSH preset, which mounts only the native read-only market tool. Ordinary reviews make no tool calls; optional recommendations permit native read-only market lookup without applying proposals.

Selected conversation content and measured usage are sent to the configured model service and incur normal model usage. The preview also records tool counts, explicit errors, call-to-result elapsed time, unfinished calls, and provider-reported token/cache usage in the review message. Unknown values stay unknown; recovery records do not imply tool failure. Each source has a cutoff and event sequence numbers: use **View conversation** beside that source in the pet, then open **Trajectory** to verify them. Details show the first 100 tool calls and 100 model usage records per source; totals cover the whole captured log. Separate highlights retain up to five entries each for explicit errors, unfinished calls, longest recorded intervals, and largest reported total-token samples across the whole log. These rankings do not establish waste, prices, or causes; samples without total tokens are excluded from that ranking and remain in missing-data counts. Text references are captured later and can have a different cutoff. Larger batches and reusable review summaries remain unimplemented. The published `v0.1.0-alpha.1` tag still provides text-only reviews.

Check **Include tool recommendations** before **Start review** to connect findings with tools; the option is off by default. The model first identifies task-specific needs from the selected history, distinguishes observed gaps from hypotheses and optional improvements, then derives its own search terms for DSH's native read-only `plugin_market` tool. No keywords are required. Results explain what may be missing, which existing capabilities or methods to try, and how a small set of complementary plugins could work together. Similar plugins are alternatives, and one sufficient plugin or no plugin is a valid outcome. Suggestions use compatible versions actually returned by configured markets; publisher claims and proposed interoperability still need verification. Searches and their results remain in the same native conversation and Trajectory. Enable Custom plugin markets and configure sources in Discover to support lookup. If lookup is unavailable or fails, the review continues with the recommendation limit stated explicitly. Inspecting and installing candidates remains your action in native Discover.

The existing task list remains: create a task from one sentence, open its native conversation, and manually check or uncheck completion.

The plugin saves task names, completion, and main Session associations. DSH provides chat, models, permissions, tools, and trajectories. Opening a task prepares or restores its conversation without sending a message. A completed model turn does not complete a task.

## Install

DSH `0.2.1-rc.2` users should keep `team-dsh@0.1.0-alpha.2`. The `0.1.0-alpha.3` preview uses rc.3 dependencies and requires DSH `0.2.1-rc.3`; upgrade DSH before installing it.

The `0.1.0-alpha.3` preview targets DSH `0.2.1-rc.3` and includes built files; no local build or installation scripts are needed. Install into the Web profile:

```sh
dsh plugin --profile web add team-dsh@0.1.0-alpha.3 --ignore-scripts
```

Start that profile normally, then enable the installed **Team DSH** bundle on the **Plugins** page. Click the floating pet to review history; **Team DSH** in the sidebar opens the task list. Report problems or suggestions through [GitHub Issues](https://github.com/guliqianxun/team_dsh/issues).

For Desktop, launch the application once to initialize its profile, then fully quit it before installing. Run the following with Desktop's bundled `dsh` command (`resources/runtime/cli/bin/dsh`, or `dsh.cmd` on Windows). The npm CLI cannot manage the reserved Desktop profile:

```sh
dsh plugin --profile desktop add team-dsh@0.1.0-alpha.3 --ignore-scripts
```

Reopen Desktop after installation and enable **Team DSH** on the **Plugins** page. Web has been tested; Desktop has not yet been tested. Use `team-dsh@next` instead of the exact version to install the current npm preview. Plugin installation does not transfer conversation history between devices.

You can also enable DSH's experimental Custom plugin markets bundle and add `https://raw.githubusercontent.com/guliqianxun/team_dsh/main/market/index.json` in Discover. This project provides that index; listings in other community markets are managed independently.

## Develop

Requires Node `^22.19.0 || >=24.0.0`, npm, and DSH `0.2.1-rc.3`.

```sh
npm ci
npm test
npm run build
npm pack --ignore-scripts
dsh plugin --profile <profile> add ./team-dsh-0.1.0-alpha.3.tgz --ignore-scripts
```

Public release commits must include the current `lib/` build. The package has no install or pack lifecycle scripts; run the tests and build above explicitly before publishing.

## Code

| Location | Responsibility |
| --- | --- |
| `src/index.ts` | Host lifecycle |
| `src/tasks/` | Task storage, Session association, page requests |
| `src/history/` | Owner-only selected-log measurements |
| `src/shared/` | Shared task and measurement fields |
| `src/client/` | Floating pet, conversation selection and submission, task list |
| `tests/` | Data preservation, associations, page interactions |

See [architecture](docs/architecture.md). Regular development requires tests and a build; lessons and tracker synchronization are optional.

## Upgrade

Back up DSH data before upgrading. Existing tasks and main Sessions remain available. Old “in progress” tasks appear incomplete. Goal editing, executions, outcomes, reviews, analysts, and automatic task context injection are removed. Their saved records remain untouched but have no active operations in this version. An unfinished legacy first-send binding requires the historical version; this version neither resends it nor replaces its Session.

Local teaching documents and Session data are not deleted. Project code is licensed under [MIT](LICENSE).

## Artwork

The whale-girl illustration comes from [Sutera-Diffusus/dsh-whale-musume](https://github.com/Sutera-Diffusus/dsh-whale-musume) under the MIT license. [Third-party notices](THIRD_PARTY_NOTICES.md) record the pinned version, copyright, and full license. Team DSH is an independent community plugin, with no affiliation to DeepSeek or the artwork project.

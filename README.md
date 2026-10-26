# Team DSH

[中文](README.zh-CN.md)

A floating history-review pet inside DSH. Click the pet, find conversations by title, select one to three, then start a review. DSH shows the result in a new native conversation where you can ask follow-up questions. Source conversations stay unchanged.

The default is the community whale-girl illustration. Open Appearance to choose the cat or a local PNG, JPEG, or WebP image up to 1 MiB. The choice stays in this browser after refresh; clearing site data resets it. Images are not sent to the model.

Native references capture history when the message starts processing. Compacted or long conversations may supply summaries or partial content. The prompt asks for user requirements, changes, assistant suggestions, and unresolved questions, supported by source names and short quotations. It uses the instance’s default model and permissions, with instructions to analyze without calling tools.

Selected conversation content is sent to the configured model service and incurs normal model usage. This preview reviews text and existing compaction summaries. Larger batches, reusable review summaries, actual tool analysis, and token/cache analysis are not implemented yet.

The existing task list remains: create a task from one sentence, open its native conversation, and manually check or uncheck completion.

The plugin saves task names, completion, and main Session associations. DSH provides chat, models, permissions, tools, and trajectories. Opening a task prepares or restores its conversation without sending a message. A completed model turn does not complete a task.

## Install

Supports DSH `0.2.1-rc.2` Web. Release commits contain built files and do not require installation scripts:

```sh
dsh plugin --profile web add 'github:guliqianxun/team_dsh#v0.1.0-alpha.1' --ignore-scripts
```

Start that profile normally. Click the floating pet to review history; **Team DSH** in the sidebar opens the task list. Report problems or suggestions through [GitHub Issues](https://github.com/guliqianxun/team_dsh/issues).

You can also enable DSH's experimental Custom plugin markets bundle and add `https://raw.githubusercontent.com/guliqianxun/team_dsh/main/market/index.json` in Discover. This project provides that index; listings in other community markets are managed independently.

## Develop

Requires Node `^22.19.0 || >=24.0.0`, npm, and DSH `0.2.1-rc.2`.

```sh
npm ci
npm test
npm run build
npm pack --ignore-scripts
dsh plugin --profile <profile> add ./team-dsh-0.1.0-alpha.1.tgz --ignore-scripts
```

Public release commits must include the current `lib/` build. The package has no install or pack lifecycle scripts; run the tests and build above explicitly before publishing.

## Code

| Location | Responsibility |
| --- | --- |
| `src/index.ts` | Host lifecycle |
| `src/tasks/` | Task storage, Session association, page requests |
| `src/shared/task.ts` | Shared wire fields |
| `src/client/` | Floating pet, conversation selection and submission, task list |
| `tests/` | Data preservation, associations, page interactions |

See [architecture](docs/architecture.md). Regular development requires tests and a build; lessons and tracker synchronization are optional.

## Upgrade

Back up DSH data before upgrading. Existing tasks and main Sessions remain available. Old “in progress” tasks appear incomplete. Goal editing, executions, outcomes, reviews, analysts, and automatic task context injection are removed. Their saved records remain untouched but have no active operations in this version. An unfinished legacy first-send binding requires the historical version; this version neither resends it nor replaces its Session.

Local teaching documents and Session data are not deleted. Project code is licensed under [MIT](LICENSE).

## Artwork

The whale-girl illustration comes from [Sutera-Diffusus/dsh-whale-musume](https://github.com/Sutera-Diffusus/dsh-whale-musume) under the MIT license. [Third-party notices](THIRD_PARTY_NOTICES.md) record the pinned version, copyright, and full license. Team DSH is an independent community plugin, with no affiliation to DeepSeek or the artwork project.

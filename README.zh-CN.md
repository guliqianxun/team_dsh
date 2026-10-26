# Team DSH

[English](README.md)

DSH 界面里的历史复盘小宠物。点击宠物，按标题找到对话，勾选 1—3 个，点击“开始复盘”。结果在新的原生对话中显示，可以继续追问；原对话不会被改写。

默认使用社区鲸鱼娘。在“外观”中可切换小猫或选择不超过 1 MiB 的 PNG、JPEG、WebP 图片。选择保存在当前浏览器，刷新后保留；清除网站数据会重置外观。图片不上传给模型。

DSH 原生引用在消息开始处理时捕获历史，已压缩或过长的对话可能只提供摘要或部分内容。复盘要求区分用户要求、要求变化、助手建议和待确认问题，并注明来源与短引文。它使用当前实例的默认模型和权限，消息明确要求只分析、不调用工具。

选中的对话内容会发送给当前配置的模型服务，产生正常模型用量。首版仅复盘文字和已有压缩摘要；更多来源的分批摘要、摘要复用、真实工具与 token/cache 分析尚未实现。

已有任务清单继续保留：一句话创建任务，点击进入原生对话，人工勾选完成或取消完成。

任务保存名称、完成状态和主 Session 关联。聊天、模型、权限和轨迹由 DSH 提供。打开任务只准备或恢复对话，发送消息才运行模型；对话结束不会自动完成任务。

## 安装

支持 DSH `0.2.1-rc.2` Web。发行提交已包含构建文件，安装时无需运行构建脚本：

```sh
dsh plugin --profile web add 'github:guliqianxun/team_dsh#v0.1.0-alpha.1' --ignore-scripts
```

随后按原来的方式启动该 profile。点击悬浮宠物开始复盘，侧栏 **Team DSH** 打开任务清单。问题与建议请提交到 [GitHub Issues](https://github.com/guliqianxun/team_dsh/issues)。

也可启用 DSH 的实验功能“自定义插件市场”，在 Discover 添加索引源：`https://raw.githubusercontent.com/guliqianxun/team_dsh/main/market/index.json`。这是本项目提供的索引；其他社区市场的收录由各自维护者决定。

## 开发

需要 Node `^22.19.0 || >=24.0.0`、npm 和 DSH `0.2.1-rc.2`。

```sh
npm ci
npm test
npm run build
npm pack --ignore-scripts
```

将生成的预览包加入自己的 DSH profile：

```sh
dsh plugin --profile <profile> add ./team-dsh-0.1.0-alpha.1.tgz --ignore-scripts
```

公开发行提交需要同时包含当前 `lib/` 构建文件。包没有安装或打包生命周期脚本，发布前显式运行上述测试与构建。

## 从哪里读代码

| 位置 | 职责 |
| --- | --- |
| `src/index.ts` | Host 加载与释放 |
| `src/tasks/` | 保存任务、打开关联 Session、接收页面请求 |
| `src/shared/task.ts` | 页面和 Host 共用的数据字段 |
| `src/client/` | 悬浮宠物、对话选择与发送、任务清单 |
| `tests/` | 数据保留、对话关联、页面操作 |

[架构](docs/architecture.md)说明消息和数据如何流转。日常修改只运行测试和构建，不要求维护教案或同步台账。

## 从旧版升级

升级前备份 DSH 数据目录。已有任务和主对话继续保留；旧“进行中”任务在最小清单中视为未完成。旧目标编辑、执行、成果、评审、分析员工具和自动任务上下文注入已移除，旧记录保留但不再提供这些操作入口。旧未完成的首发绑定需回到历史版本处理，本版不重发、不替换其 Session。

用户教学目录与本机 Session 不删除。项目代码采用 [MIT](LICENSE) 许可。

## 素材

鲸鱼娘来自 [Sutera-Diffusus/dsh-whale-musume](https://github.com/Sutera-Diffusus/dsh-whale-musume)，按 MIT 许可随包提供。[第三方声明](THIRD_PARTY_NOTICES.md)记录固定版本、版权和许可。Team DSH 是独立社区插件，与 DeepSeek 和该素材项目均无隶属关系。

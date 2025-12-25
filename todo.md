1. RingBuffer 自适应扩容（按负载）

2. Web Worker → SharedWorker / SAB（多视图共享）

3. 时间回放（record & replay）

4. 性能仪表板（edge congestion heatmap）

需求：
配置节点、端口、管道、材质、颜色、动画、数据流
绑定数据源

工程能力：
测试用例、性能测试、压力测试

# TODO

Undo / Redo（Command + Time Travel）

流程校验器（工业规则 / 死锁检测）

性能监控 + 可视化（拥塞热力图）

React Editor UI（工业软件风格）


Edge-Draw 模式（连线工具）

Shift + Drag 从 Port 到 Port 生成 edge

自动校验：禁止自环、禁止重复、禁止非法拓扑

Undo/Redo（Command Stack）

所有 GraphStore.update 变成 command
# TODO
👉 给 Edge 做“连线模式（Draw Edge Tool）”
这是工业流程编辑器真正开始“能用”的标志。

如果你愿意，我可以直接给你 连线模式的完整实现（Three + React + 校验）。

# TODO:
✔ O(1) Undo / Redo
✔ 大图不会爆内存
✔ 拖拽 / 连续输入只占 1 条历史
✔ Command 清晰，可审计
✔ 为 协同编辑 / CRDT / Replay 打好地基

这已经是 Figma / CAD / 工业流程编辑器同级别架构

我可以继续帮你做 工业级 History 优化：

⏱️ 时间窗口 merge（typing 300ms 内自动合并）

🧠 Command 压缩（move → last only）

🌐 多用户协同（Command log → OT/CRDT）

📼 仿真回放（Command timeline）
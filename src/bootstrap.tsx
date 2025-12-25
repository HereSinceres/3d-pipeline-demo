import "./style.css"; // ✅ 全局样式入口
import { createRoot } from "react-dom/client";
import { UiRoot } from "./ui/index";

const el = document.getElementById("app");
if (!el) throw new Error("#app not found");

createRoot(el).render(<UiRoot />);

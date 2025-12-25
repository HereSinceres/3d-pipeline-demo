import { GraphStore } from "../graph/GraphStore";
import { History } from "../editor/history/History";

export function createApp() {
  const graphStore = new GraphStore();

  const history = new History(
    () => graphStore.get(),
    (g) => graphStore.set(g)
  );

  return {
    graphStore,
    history,
  };
}

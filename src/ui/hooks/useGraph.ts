import { useEffect, useState } from "react";
import type { GraphStore } from "../../graph/GraphStore";
import type { FlowGraphV1 } from "../../runtime/workerProtocol";

export function useGraph(store: GraphStore) {
  const [graph, setGraph] = useState<FlowGraphV1>(() => store.get());

  useEffect(() => {
    return store.subscribe(() => {
      setGraph(store.get());
    });
  }, [store]);

  return graph;
}

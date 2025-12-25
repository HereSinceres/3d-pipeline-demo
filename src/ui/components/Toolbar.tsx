import React from "react";
export function Toolbar(props: {
  onSave: () => void;
  onLoad: () => void;
}) {
  return (
    <div className="toolbar">
      <div className="title">Industrial Flow Editor</div>
      <div className="spacer" />
      <button onClick={props.onSave}>Save</button>
      <button onClick={props.onLoad}>Load</button>
    </div>
  );
}

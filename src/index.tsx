import React from "react";
import { render } from "ink";
import { InkPictureProvider } from "ink-picture";
import { App } from "./App.js";

render(
  React.createElement(
    InkPictureProvider,
    null,
    React.createElement(App)
  )
);

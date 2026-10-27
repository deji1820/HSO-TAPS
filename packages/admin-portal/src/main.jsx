import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import DialogHost from "../../shared-ui/src/DialogHost.jsx";
import "./styles/theme.css";


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <><App /><DialogHost /></>
  </React.StrictMode>
);

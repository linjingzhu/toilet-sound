import React from "react";
import ReactDOM from "react-dom/client";
import { NativeApp } from "./native-app";
import "./veil/fonts";
import "./prototype.css";
import "./native.css";

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><NativeApp /></React.StrictMode>);

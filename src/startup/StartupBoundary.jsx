import { Component } from "react";

export default class StartupBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error) {
    window.__startupDiagnostics?.fail("React 渲染失败", error);
  }

  render() { return this.state.failed ? null : this.props.children; }
}

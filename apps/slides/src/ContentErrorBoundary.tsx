import { Component, type ReactNode } from "react";

export class ContentErrorBoundary extends Component<{
  children: ReactNode;
  fallback: ReactNode;
  onError(error: Error): void;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

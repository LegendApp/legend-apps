import { Component, type ReactNode } from "react";

export class ContentErrorBoundary extends Component<{
  children: ReactNode;
  resetKey?: string;
  fallback: ReactNode;
  onError(error: Error): void;
}, { failed: boolean; resetKey?: string }> {
  state: { failed: boolean; resetKey?: string } = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromProps(props: { resetKey?: string }, state: { resetKey?: string }) {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null;
  }

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

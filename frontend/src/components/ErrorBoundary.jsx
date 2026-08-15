import { Component } from 'react';

/** Last line of defence: a render crash shouldn't leave a blank screen at a till. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('[ui]', error, info && info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const t = this.props.t;
    return (
      <div className="boot">
        <p className="boot-title">{t.crashTitle}</p>
        <p className="boot-text">{t.crashSub}</p>
        <button type="button" className="btn btn-solid" onClick={() => window.location.reload()}>
          {t.reload}
        </button>
      </div>
    );
  }
}

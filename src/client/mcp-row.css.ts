export const MCP_ROW_CSS = `
[data-dsh-mcp] {
  display: flex;
  flex-direction: column;
}
[data-dsh-mcp] .dsh-mcp-row {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  height: 24px;
  min-width: 0;
}
[data-dsh-mcp] .dsh-mcp-row[data-expandable] {
  cursor: pointer;
}
[data-dsh-mcp][data-state='running'] .dsh-mcp-row::after {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 300px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent) 55%,
    transparent 100%
  );
  animation: dsh-mcp-row-sweep 2.6s ease-out infinite;
  pointer-events: none;
}
@keyframes dsh-mcp-row-sweep {
  0% { left: -300px; }
  90%, 100% { left: 100%; }
}
[data-dsh-mcp] .dsh-mcp-leading {
  position: relative;
  flex: none;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 6px;
  color: var(--dsw-alias-label-tertiary);
}
[data-dsh-mcp] .dsh-mcp-chevron {
  color: var(--dsw-alias-label-secondary);
}
[data-dsh-mcp] .dsh-mcp-icon-idle {
  display: inline-flex;
  opacity: 1;
  transition: opacity 100ms ease;
}
[data-dsh-mcp] .dsh-mcp-chevron-hover {
  position: absolute;
  inset: 0;
  margin: auto;
  opacity: 0;
  transition: opacity 100ms ease;
}
[data-dsh-mcp] .dsh-mcp-row:hover .dsh-mcp-icon-idle {
  opacity: 0;
}
[data-dsh-mcp] .dsh-mcp-row:hover .dsh-mcp-chevron-hover {
  opacity: 1;
}
[data-dsh-mcp] .dsh-mcp-title {
  flex: none;
  font-size: 14px;
  line-height: 24px;
  color: var(--dsw-alias-label-secondary);
}
[data-dsh-mcp] .dsh-mcp-sep {
  flex: none;
  width: 2px;
  height: 2px;
  border-radius: 1px;
  margin: 0 8px;
  background: var(--dsw-alias-label-caption);
}
[data-dsh-mcp] .dsh-mcp-summary {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 24px;
  color: var(--dsw-alias-label-tertiary);
}
[data-dsh-mcp] .dsh-mcp-summary[data-error] {
  color: var(--dsw-alias-state-error-primary);
}
[data-dsh-mcp] .dsh-mcp-body {
  display: flex;
  flex-direction: column;
}
[data-dsh-mcp] .dsh-mcp-card {
  display: flex;
  flex-direction: column;
  max-height: 260px;
  margin: 4px 0 4px 4px;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-markdown-code-block);
}
[data-dsh-mcp] .dsh-mcp-card-head {
  flex: none;
  padding: 8px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-markdown-code-block-banner);
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
  color: var(--dsw-alias-label-caption);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
[data-dsh-mcp] .dsh-mcp-pre {
  min-height: 0;
  margin: 0;
  padding: 10px 12px 12px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: var(--dsw-font-markdown-code-block-small);
  color: var(--dsw-alias-label-secondary);
}
[data-dsh-mcp] .dsh-mcp-pre[data-error] {
  color: var(--dsw-alias-state-error-primary);
}
[data-dsh-mcp] .dsh-mcp-pre a {
  color: var(--dsw-alias-label-primary);
}
[data-dsh-mcp] .dsh-mcp-auth {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  margin: 6px 0 4px 4px;
  padding: 4px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  text-decoration: none;
}
[data-dsh-mcp] .dsh-mcp-auth:hover {
  background: var(--dsw-alias-interactive-bg-hover-solid);
}
[data-dsh-mcp] .dsh-mcp-servers {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px 10px;
}
[data-dsh-mcp] .dsh-mcp-server {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}
[data-dsh-mcp] .dsh-mcp-server strong {
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
[data-dsh-mcp] .dsh-mcp-inspect {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 4px;
  margin: 4px 0 2px 4px;
  padding: 2px 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 16px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 100ms ease;
}
[data-dsh-mcp]:hover .dsh-mcp-inspect,
[data-dsh-mcp] .dsh-mcp-inspect:focus-visible {
  opacity: 1;
}
[data-dsh-mcp] .dsh-mcp-inspect:hover {
  background: var(--dsw-alias-interactive-bg-hover-solid);
  color: var(--dsw-alias-label-primary);
}
@media (prefers-reduced-motion: reduce) {
  [data-dsh-mcp][data-state='running'] .dsh-mcp-row::after {
    animation: none;
    display: none;
  }
}
`

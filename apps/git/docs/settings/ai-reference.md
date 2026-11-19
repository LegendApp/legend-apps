# Legend Git settings for AI agents

<!-- Generated from apps/git/src/settings (schema.ts, commandMeta.ts); do not edit. -->

## Rules an AI must follow

1. Reply with exactly one JSON object and nothing else: no prose, no code fence.
2. The object has `"version": 1` and only the keys the request needs (the smallest patch). It is merged onto the user's settings.
3. Use only the keys, values, panel ids and command ids listed here. Never invent keys or command ids.
4. Objects merge key by key, but arrays (toolbar items, columns, menu entries, lane colors, sidebar sections) and layout nodes replace whole: write the complete array or node.
5. To start from another preset set `extends`: `sourcetree`, `fork`, `gitkraken`. A preset's layout is active when `layout.active` names it.
6. A new layout goes in `layout.layouts.<name>` with `layout.active` set to that name; give it a `changes` view when its `default` view lacks the staging panels.
7. Colors are `#RRGGBB`, `#RRGGBBAA` or `system:<NSColor name>`. Key bindings use `Cmd`, `Ctrl`, `Alt`, `Shift` and a key, joined with `+` (`Cmd+Shift+L`, `Space`).
8. There are no shell commands or scripts: toolbars and menus reference command ids only.

## File shape

Top-level keys: `version` (required), `extends`, `appearance`, `density`, `theme`, `layout`, `panels`, `sidebar`, `toolbar`, `contextMenus`, `keybindings`. Every leaf, with its type or allowed values:

- `extends`: `"sourcetree"` \| `"fork"` \| `"gitkraken"`
- `appearance`: `"system"` \| `"light"` \| `"dark"` (default "system")
- `density`: `"compact"` \| `"regular"` \| `"comfortable"` (default "regular")
- `theme.name`: string (default "Default")
- `theme.fonts.code`: string (default "system-mono")
- `theme.fonts.codeSize`: number 8–32 (default 12)
- `theme.light.accent`: string (default "system:controlAccentColor")
- `theme.light.status.added`: string (default "#28CD41")
- `theme.light.status.modified`: string (default "#FF9500")
- `theme.light.status.deleted`: string (default "#FF3B30")
- `theme.light.status.renamed`: string (default "#007AFF")
- `theme.light.status.typeChanged`: string (default "#AF52DE")
- `theme.light.status.untracked`: string (default "#8E8E93")
- `theme.light.status.conflicted`: string (default "#FF3B30")
- `theme.light.diff.addedLine`: string (default "#dafbe1")
- `theme.light.diff.removedLine`: string (default "#ffebe9")
- `theme.light.diff.addedWord`: string (default "#1a7f37")
- `theme.light.diff.removedWord`: string (default "#cf222e")
- `theme.light.diff.hunkHeader`: string (default "system:secondaryLabelColor")
- `theme.light.diff.gutter`: string (default "system:tertiaryLabelColor")
- `theme.light.diff.selection`: string (default "system:selectedContentBackgroundColor")
- `theme.light.lanes`: array of string (default ["#007AFF","#AF52DE","#FF2D55","#FF9500","#28CD41","#30B0C7","#5856D6","#A2845E","#FF3B30","#FFCC00","#00000042"])
- `theme.light.refs.localBranch`: string (default "#007AFF")
- `theme.light.refs.remoteBranch`: string (default "#8E8E93")
- `theme.light.refs.tag`: string (default "#FF9500")
- `theme.light.refs.head`: string (default "#28CD41")
- `theme.dark.accent`: string (default "system:controlAccentColor")
- `theme.dark.status.added`: string (default "#32D74B")
- `theme.dark.status.modified`: string (default "#FF9F0A")
- `theme.dark.status.deleted`: string (default "#FF453A")
- `theme.dark.status.renamed`: string (default "#0A84FF")
- `theme.dark.status.typeChanged`: string (default "#BF5AF2")
- `theme.dark.status.untracked`: string (default "#98989D")
- `theme.dark.status.conflicted`: string (default "#FF453A")
- `theme.dark.diff.addedLine`: string (default "#17351f")
- `theme.dark.diff.removedLine`: string (default "#3a1d24")
- `theme.dark.diff.addedWord`: string (default "#7ee787")
- `theme.dark.diff.removedWord`: string (default "#ff7b72")
- `theme.dark.diff.hunkHeader`: string (default "system:secondaryLabelColor")
- `theme.dark.diff.gutter`: string (default "system:tertiaryLabelColor")
- `theme.dark.diff.selection`: string (default "system:selectedContentBackgroundColor")
- `theme.dark.lanes`: array of string (default ["#0A84FF","#BF5AF2","#FF375F","#FF9F0A","#32D74B","#40C8E0","#5E5CE6","#AC8E68","#FF453A","#FFD60A","#FFFFFF40"])
- `theme.dark.refs.localBranch`: string (default "#0A84FF")
- `theme.dark.refs.remoteBranch`: string (default "#98989D")
- `theme.dark.refs.tag`: string (default "#FF9F0A")
- `theme.dark.refs.head`: string (default "#32D74B")
- `layout.active`: string (default "sourcetree")
- `layout.layouts`: map of map of any
- `panels.commitList.density`: `"compact"` \| `"regular"` \| `"comfortable"`
- `panels.commitList.columns`: array of map of any (default [{"id":"graph"},{"id":"subject"},{"id":"author","width":160},{"id":"date","width":140},{"id":"sha","width":72}])
- `panels.commitList.graph.style`: `"compact"` \| `"wide"` (default "wide")
- `panels.commitList.graph.laneWidth`: number 8–24 (default 12)
- `panels.commitList.graph.nodeStyle`: `"dot"` \| `"ring"` (default "dot")
- `panels.commitList.graph.lineWidth`: number 1–3 (default 2)
- `panels.commitList.graph.maxLanes`: integer 4–24 (default 12)
- `panels.commitList.graph.colorBy`: `"lane"` \| `"branch"` (default "lane")
- `panels.commitList.refs`: `"inline"` \| `"column"` \| `"hidden"` (default "inline")
- `panels.commitList.refStyle`: `"text"` \| `"tinted"` (default "text")
- `panels.commitList.showRemoteRefs`: boolean (default true)
- `panels.commitList.showTags`: boolean (default true)
- `panels.commitList.dateFormat`: `"relative"` \| `"short"` \| `"medium"` \| `"iso"` (default "relative")
- `panels.commitList.highlightPulled`: boolean (default false)
- `panels.commitDetails.showBody`: boolean (default true)
- `panels.commitDetails.showCommitter`: boolean (default true)
- `panels.commitDetails.fileListPlacement`: `"below"` \| `"beside"` \| `"none"` (default "none")
- `panels.fileList.density`: `"compact"` \| `"regular"` \| `"comfortable"`
- `panels.fileList.style`: `"flat"` \| `"tree"` (default "flat")
- `panels.fileList.sort`: `"path"` \| `"name"` \| `"status"` (default "path")
- `panels.fileList.showFolder`: boolean (default true)
- `panels.fileList.stagingControl`: `"buttons"` \| `"checkboxes"` (default "buttons")
- `panels.unstaged.density`: `"compact"` \| `"regular"` \| `"comfortable"`
- `panels.unstaged.style`: `"flat"` \| `"tree"` (default "flat")
- `panels.unstaged.sort`: `"path"` \| `"name"` \| `"status"` (default "path")
- `panels.unstaged.showFolder`: boolean (default true)
- `panels.unstaged.stagingControl`: `"buttons"` \| `"checkboxes"` (default "buttons")
- `panels.staged.density`: `"compact"` \| `"regular"` \| `"comfortable"`
- `panels.staged.style`: `"flat"` \| `"tree"` (default "flat")
- `panels.staged.sort`: `"path"` \| `"name"` \| `"status"` (default "path")
- `panels.staged.showFolder`: boolean (default true)
- `panels.staged.stagingControl`: `"buttons"` \| `"checkboxes"` (default "buttons")
- `panels.changes.density`: `"compact"` \| `"regular"` \| `"comfortable"`
- `panels.changes.style`: `"flat"` \| `"tree"` (default "flat")
- `panels.changes.sort`: `"path"` \| `"name"` \| `"status"` (default "path")
- `panels.changes.showFolder`: boolean (default true)
- `panels.changes.stagingControl`: `"buttons"` \| `"checkboxes"` (default "buttons")
- `panels.composer.bodyLines`: integer 1–40 (default 4)
- `panels.composer.showAmend`: boolean (default true)
- `panels.composer.showSignOff`: boolean (default false)
- `panels.composer.showGenerate`: boolean (default true)
- `panels.diff.mode`: `"unified"` \| `"sideBySide"` (default "unified")
- `panels.diff.sideBySideSplit`: `"vertical"` \| `"horizontal"` (default "vertical")
- `panels.diff.wrap`: boolean (default false)
- `panels.diff.contextLines`: integer 0–20 (default 3)
- `panels.diff.showWhitespace`: boolean (default false)
- `panels.diff.ignoreWhitespace`: `"none"` \| `"trailing"` \| `"all"` (default "none")
- `panels.diff.lineNumbers`: `"both"` \| `"new"` \| `"none"` (default "both")
- `panels.diff.hunkActions`: `"header"` \| `"none"` (default "none")
- `panels.diff.density`: `"compact"` \| `"regular"` \| `"comfortable"`
- `panels.prDetails.showChecks`: boolean (default true)
- `sidebar.sections`: array of map of any (default [{"id":"workspace"},{"id":"reviewQueue"},{"id":"branches"},{"id":"remotes"},{"id":"tags"},{"id":"stashes"},{"id":"worktrees"},{"id":"pullRequests"}])
- `sidebar.showCounts`: boolean (default true)
- `toolbar.displayMode`: `"iconAndLabel"` \| `"iconOnly"` \| `"labelOnly"` (default "iconAndLabel")
- `toolbar.items`: array of `"branchPicker"` \| `"viewSwitcher"` \| `"search"` \| `"networkProgress"` \| `"space"` \| `"flexibleSpace"` or commandId or map of any (default ["toggle-sidebar","branchPicker","flexibleSpace","viewSwitcher","networkProgress","refresh","search"])
- `contextMenus.commit`: array of menuEntry
- `contextMenus.file`: array of menuEntry
- `contextMenus.branch`: array of menuEntry
- `contextMenus.remoteBranch`: array of menuEntry
- `contextMenus.tag`: array of menuEntry
- `contextMenus.stash`: array of menuEntry
- `contextMenus.worktree`: array of menuEntry
- `contextMenus.diffLine`: array of menuEntry
- `contextMenus.pullRequest`: array of menuEntry
- `contextMenus.reviewEntry`: array of menuEntry
- `keybindings`: map of array of string

## Layout node grammar

A layout has a `views` object with a required `default` tree and optional trees per view kind: `changes`, `history`, `ref`, `stash`, `worktree`, `review`, `pullRequest`. A missing or null kind uses `default`.
A tree is made of three node types:
- `{ "type": "split", "direction": "row" | "column", "children": [ { "node": <node>, "size"?, "minSize"?, "maxSize"?, "collapsible"?, "holdingPriority"? }, … ] }` with 2 to 4 children. `row` puts children side by side, `column` stacks them.
- `{ "type": "panel", "panel": <panel id>, "id"?, "options"? }`. Panel ids: `commitList`, `commitDetails`, `fileList`, `unstaged`, `staged`, `changes`, `composer`, `diff`, `prDetails`, `empty`. `options` overrides `panels.<panel>` for this pane only.
- `{ "type": "switch", "cases": [ { "when": <condition>, "node": <node> } ], "otherwise": <node> }`. Conditions: `fileSelected`, `commitSelected`, `operationInProgress`.
Rules checked on load (a view that breaks one falls back to the base preset's view, with an issue naming the node path):
- every view reaches a `diff` panel;
- a panel appears once per view unless each copy has its own `id` (different branches of a switch may repeat one);
- the panes' minimum sizes (default 120 pt each) fit a 960 × 542 pt content area;
- `options` validate against that panel's options.

## Toolbar and menus

Toolbar entries: a command id, `{ "command": <id>, "label"?, "symbol"? }`, or a widget (branchPicker, viewSwitcher, search, networkProgress, space, flexibleSpace). Context menu targets: commit, file, branch, remoteBranch, tag, stash, worktree, diffLine, pullRequest, reviewEntry; entries are command ids, `"separator"` or `{ "submenu", "items" }`.

## Command ids

- `open-repository`: Open Repository…
- `undo-operation`: Undo Last Operation
- `open-recent`: Open Recent
- `abort-operation`: Abort Operation…
- `continue-operation`: Continue Operation
- `toggle-sidebar`: Toggle Sidebar
- `show-changes`: Show Changes
- `show-history`: Show History
- `show-review`: Show Review Queue
- `push-review`: Push Queued Branch (menus: reviewEntry)
- `fetch`: Fetch
- `pull`: Pull
- `push`: Push
- `cancel-network`: Stop Network Operation
- `refresh`: Refresh
- `sign-in-github`: Sign In to GitHub…
- `sign-out-github`: Sign Out of GitHub
- `review-pull-request`: Review Pull Request…
- `checkout-pull-request`: Check Out Pull Request as Branch (menus: pullRequest)
- `pull-request-worktree`: Open Pull Request in New Worktree… (menus: pullRequest)
- `copy-sha`: Copy SHA (menus: commit)
- `open-github`: Open on GitHub (menus: commit)
- `create-pull-request`: Create Pull Request… (menus: branch)
- `show-file-history`: Show File History (menus: file)
- `show-all-history`: Show All History
- `blame-line`: Blame Line (menus: diffLine)
- `compare-with-selected`: Compare with Selected (menus: commit)
- `apply-lines`: Stage or Unstage Selected Lines (menus: diffLine)
- `discard-file`: Discard Changes to File… (menus: file)
- `discard-lines`: Discard Selected Lines… (menus: diffLine)
- `restore-discard`: Restore Last Discard…
- `stage-file`: Stage File (menus: file)
- `unstage-file`: Unstage File (menus: file)
- `stage-all`: Stage All
- `unstage-all`: Unstage All
- `generate-message`: Generate Commit Message
- `commit`: Commit
- `checkout-ref`: Check Out (menus: branch, remoteBranch)
- `switch-branch`: Switch Branch…
- `new-branch`: New Branch… (menus: commit, branch, remoteBranch, tag)
- `rename-branch`: Rename Branch… (menus: branch)
- `delete-branch`: Delete Branch… (menus: branch)
- `merge-ref`: Merge into Current Branch… (menus: branch, remoteBranch)
- `rebase-ref`: Rebase Current Branch onto… (menus: branch, remoteBranch)
- `interactive-rebase-ref`: Rebase Current Branch Interactively onto… (menus: branch, remoteBranch)
- `interactive-rebase-commit`: Rebase Interactively onto This Commit… (menus: commit)
- `cherry-pick-commit`: Cherry-Pick Commit (menus: commit)
- `revert-commit`: Revert Commit… (menus: commit)
- `mark-resolved`: Mark Resolved (menus: file)
- `use-ours`: Use Ours (menus: file)
- `use-theirs`: Use Theirs (menus: file)
- `use-both`: Use Both (menus: file)
- `copy-ref-name`: Copy Name (menus: branch, remoteBranch, tag)
- `stash-changes`: Stash Changes…
- `stash-all-changes`: Stash Changes Including Untracked…
- `apply-stash`: Apply Stash (menus: stash)
- `pop-stash`: Pop Stash (menus: stash)
- `drop-stash`: Drop Stash… (menus: stash)
- `open-worktree`: Open Worktree in New Window (menus: worktree, reviewEntry)
- `open-review-worktree`: Open Queued Worktree
- `new-worktree`: New Worktree…
- `remove-worktree`: Remove Worktree… (menus: worktree)
- `reveal-repository`: Show in Finder
- `reveal-worktree`: Reveal in Finder (menus: worktree, reviewEntry)

## Worked examples

Request: “Make it look like Fork but keep the diff side by side.”

```json
{
  "version": 1,
  "extends": "fork",
  "panels": {
    "diff": {
      "mode": "sideBySide"
    }
  }
}
```

Request: “Compact everything; I have a 13-inch screen.”

```json
{
  "version": 1,
  "density": "compact",
  "toolbar": {
    "displayMode": "iconOnly"
  },
  "theme": {
    "fonts": {
      "codeSize": 11
    }
  },
  "panels": {
    "composer": {
      "bodyLines": 3
    },
    "diff": {
      "contextLines": 2
    }
  }
}
```

Request: “Add Cherry-Pick and Revert to the commit context menu at the top, and remove Copy SHA from the toolbar.”

```json
{
  "version": 1,
  "contextMenus": {
    "commit": [
      "cherry-pick-commit",
      "revert-commit",
      "separator",
      "compare-with-selected",
      "separator",
      "new-branch",
      "separator",
      "interactive-rebase-commit",
      "separator",
      "copy-sha",
      "open-github"
    ]
  },
  "toolbar": {
    "items": [
      "commit",
      "pull",
      "push",
      "fetch",
      "space",
      "new-branch",
      "merge-ref",
      "stash-changes",
      "flexibleSpace",
      "networkProgress",
      "reveal-repository",
      "search"
    ]
  }
}
```

Request: “Bind Stage to Space and Unstage to Shift-Space.”

```json
{
  "version": 1,
  "keybindings": {
    "stage-file": [
      "Space"
    ],
    "unstage-file": [
      "Shift+Space"
    ]
  }
}
```

Request: “Put the diff below the commit list instead of on the right, and hide the author column.”

```json
{
  "version": 1,
  "extends": "fork",
  "layout": {
    "active": "diff-below",
    "layouts": {
      "diff-below": {
        "description": "Fork's layout with the diff under the commit list and the commit's details and files at the bottom.",
        "sidebar": {
          "width": 200
        },
        "views": {
          "default": {
            "type": "split",
            "direction": "column",
            "children": [
              {
                "node": {
                  "type": "panel",
                  "panel": "commitList"
                },
                "size": 240,
                "minSize": 140
              },
              {
                "node": {
                  "type": "panel",
                  "panel": "diff"
                },
                "minSize": 200
              },
              {
                "node": {
                  "type": "split",
                  "direction": "row",
                  "children": [
                    {
                      "node": {
                        "type": "panel",
                        "panel": "commitDetails"
                      },
                      "size": 360
                    },
                    {
                      "node": {
                        "type": "panel",
                        "panel": "fileList"
                      }
                    }
                  ]
                },
                "size": 180
              }
            ]
          },
          "changes": {
            "type": "split",
            "direction": "row",
            "children": [
              {
                "node": {
                  "type": "split",
                  "direction": "column",
                  "children": [
                    {
                      "node": {
                        "type": "panel",
                        "panel": "unstaged"
                      }
                    },
                    {
                      "node": {
                        "type": "panel",
                        "panel": "staged"
                      }
                    },
                    {
                      "node": {
                        "type": "panel",
                        "panel": "composer"
                      },
                      "size": 132,
                      "minSize": 104
                    }
                  ]
                },
                "size": 320,
                "minSize": 260
              },
              {
                "node": {
                  "type": "panel",
                  "panel": "diff"
                },
                "minSize": 400
              }
            ]
          }
        }
      }
    }
  },
  "panels": {
    "commitList": {
      "columns": [
        {
          "id": "graph"
        },
        {
          "id": "subject"
        },
        {
          "id": "date",
          "width": 140
        },
        {
          "id": "sha",
          "width": 72
        }
      ]
    }
  }
}
```

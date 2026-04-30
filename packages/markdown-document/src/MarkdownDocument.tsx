import { LegendList, type LegendListRenderItemProps } from "@legendapp/list/react-native";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { EnrichedMarkdownText } from "react-native-enriched-markdown";
import { Linking, StyleSheet, Text, View } from "react-native";
import { nativeMarkdownDocumentAdapter } from "./adapters/nativeMarkdownDocumentAdapter";
import { defaultMarkdownStyle } from "./styles";
import type {
  MarkdownBlockSnapshot,
  MarkdownDocumentCommands,
  MarkdownDocumentProps,
  MarkdownDocumentSnapshot,
  MarkdownSaveState,
} from "./types";

type DocumentState =
  | {
      status: "loading";
      snapshot?: undefined;
      error?: undefined;
    }
  | {
      status: "loaded";
      snapshot: MarkdownDocumentSnapshot;
      error?: undefined;
    }
  | {
      status: "error";
      snapshot?: undefined;
      error: Error;
    };

const estimatedItemSize = 120;
const hydrateChunkSize = 512;

function MarkdownBlockRow({
  block,
  markdownStyle,
}: LegendListRenderItemProps<string> & {
  block?: MarkdownBlockSnapshot;
  markdownStyle: NonNullable<MarkdownDocumentProps["markdownStyle"]>;
}) {
  if (!block) {
    return null;
  }

  return (
    <View style={styles.blockRow}>
      <EnrichedMarkdownText
        allowTrailingMargin={false}
        containerStyle={styles.renderedText}
        flavor="github"
        markdown={block.markdown}
        markdownStyle={markdownStyle}
        onLinkPress={(event) => {
          void Linking.openURL(event.url);
        }}
        selectable
      />
    </View>
  );
}

export const MarkdownDocument = forwardRef<MarkdownDocumentCommands, MarkdownDocumentProps>(
  (
    {
      adapter = nativeMarkdownDocumentAdapter,
      commandsRef,
      contentContainerStyle,
      filename,
      markdownStyle,
      onDirtyChange,
      onError,
      onLoaded,
      onSaveStateChange,
      style,
      theme,
    },
    ref,
  ) => {
    const loadVersionRef = useRef(0);
    const hydrateFrameRef = useRef<number | undefined>(undefined);
    const [blockIds, setBlockIds] = useState<string[]>([]);
    const [blocksById, setBlocksById] = useState(() => new Map<string, MarkdownBlockSnapshot>());
    const [documentState, setDocumentState] = useState<DocumentState>({ status: "loading" });
    const [saveState, setSaveState] = useState<MarkdownSaveState>("idle");

    const setNextSaveState = useCallback(
      (nextSaveState: MarkdownSaveState) => {
        setSaveState(nextSaveState);
        onSaveStateChange?.(nextSaveState);
      },
      [onSaveStateChange],
    );

    const cancelHydration = useCallback(() => {
      if (hydrateFrameRef.current !== undefined) {
        cancelAnimationFrame(hydrateFrameRef.current);
        hydrateFrameRef.current = undefined;
      }
    }, []);

    const mergeBlocks = useCallback((blocks: MarkdownBlockSnapshot[]) => {
      if (blocks.length === 0) {
        return;
      }

      setBlocksById((previousBlocksById) => {
        const nextBlocksById = new Map(previousBlocksById);
        for (const block of blocks) {
          nextBlocksById.set(block.id, block);
        }
        return nextBlocksById;
      });

      setBlockIds((previousBlockIds) => {
        const seen = new Set(previousBlockIds);
        const nextBlockIds = [...previousBlockIds];
        for (const block of blocks) {
          if (!seen.has(block.id)) {
            seen.add(block.id);
            nextBlockIds.push(block.id);
          }
        }
        return nextBlockIds;
      });
    }, []);

    const hydrateRemainingBlocks = useCallback(
      (snapshot: MarkdownDocumentSnapshot, loadVersion: number) => {
        cancelHydration();

        let startIndex = snapshot.initialBlocks.length;
        const hydrateNextChunk = () => {
          hydrateFrameRef.current = undefined;
          if (loadVersion !== loadVersionRef.current || startIndex >= snapshot.blockCount) {
            return;
          }

          const count = Math.min(hydrateChunkSize, snapshot.blockCount - startIndex);
          void adapter
            .getBlocks(snapshot.documentId, startIndex, count)
            .then((blocks) => {
              if (loadVersion !== loadVersionRef.current) {
                return;
              }

              mergeBlocks(blocks);
              startIndex += blocks.length;

              if (blocks.length > 0 && startIndex < snapshot.blockCount) {
                hydrateFrameRef.current = requestAnimationFrame(hydrateNextChunk);
              }
            })
            .catch((error: unknown) => {
              if (loadVersion !== loadVersionRef.current) {
                return;
              }

              const nextError = error instanceof Error ? error : new Error(String(error));
              setDocumentState({ status: "error", error: nextError });
              onError?.(nextError);
            });
        };

        if (startIndex < snapshot.blockCount) {
          hydrateFrameRef.current = requestAnimationFrame(hydrateNextChunk);
        }
      },
      [adapter, cancelHydration, mergeBlocks, onError],
    );

    useEffect(() => {
      loadVersionRef.current += 1;
      const loadVersion = loadVersionRef.current;
      let isCanceled = false;

      cancelHydration();
      setDocumentState({ status: "loading" });
      setBlockIds([]);
      setBlocksById(new Map());
      setNextSaveState("idle");
      onDirtyChange?.(false);

      void adapter
        .load(filename)
        .then((snapshot) => {
          if (isCanceled || loadVersion !== loadVersionRef.current) {
            void adapter.close(snapshot.documentId);
            return;
          }

          const nextBlocksById = new Map<string, MarkdownBlockSnapshot>();
          for (const block of snapshot.initialBlocks) {
            nextBlocksById.set(block.id, block);
          }

          setBlocksById(nextBlocksById);
          setBlockIds(snapshot.initialBlocks.map((block) => block.id));
          setDocumentState({ status: "loaded", snapshot });
          onLoaded?.({
            documentId: snapshot.documentId,
            filename: snapshot.filename,
            blockCount: snapshot.blockCount,
            sourceSize: snapshot.sourceSize,
          });
        })
        .catch((error: unknown) => {
          if (isCanceled || loadVersion !== loadVersionRef.current) {
            return;
          }

          const nextError = error instanceof Error ? error : new Error(String(error));
          setDocumentState({ status: "error", error: nextError });
          onError?.(nextError);
        });

      return () => {
        isCanceled = true;
        cancelHydration();
      };
    }, [adapter, cancelHydration, filename, onDirtyChange, onError, onLoaded, setNextSaveState]);

    useEffect(() => {
      if (documentState.status !== "loaded") {
        return undefined;
      }

      const documentId = documentState.snapshot.documentId;
      return () => {
        void adapter.close(documentId);
      };
    }, [adapter, documentState]);

    const save = useCallback(() => {
      if (documentState.status !== "loaded" || saveState === "saving") {
        return;
      }

      setNextSaveState("saving");
      void adapter
        .save(documentState.snapshot.documentId)
        .then(() => {
          setNextSaveState("idle");
          onDirtyChange?.(false);
        })
        .catch((error: unknown) => {
          const nextError = error instanceof Error ? error : new Error(String(error));
          setNextSaveState("error");
          onError?.(nextError);
        });
    }, [adapter, documentState, onDirtyChange, onError, saveState, setNextSaveState]);

    const commands = useMemo<MarkdownDocumentCommands>(
      () => ({
        focus() {},
        insertLink() {},
        redo() {},
        save,
        toggleBold() {},
        toggleItalic() {},
        undo() {},
      }),
      [save],
    );

    useImperativeHandle(ref, () => commands, [commands]);
    useImperativeHandle(commandsRef, () => commands, [commands]);

    const resolvedMarkdownStyle = markdownStyle ?? defaultMarkdownStyle;
    const contentStyle = useMemo(
      () => [styles.contentContainer, contentContainerStyle],
      [contentContainerStyle],
    );

    if (documentState.status === "error") {
      return (
        <View style={[styles.container, theme?.backgroundColor ? { backgroundColor: theme.backgroundColor } : null, style]}>
          <Text style={[styles.errorText, theme?.errorColor ? { color: theme.errorColor } : null]}>
            {documentState.error.message}
          </Text>
        </View>
      );
    }

    if (documentState.status === "loading") {
      return (
        <View style={[styles.container, styles.centered, theme?.backgroundColor ? { backgroundColor: theme.backgroundColor } : null, style]}>
          <Text style={[styles.statusText, theme?.mutedForegroundColor ? { color: theme.mutedForegroundColor } : null]}>
            Loading document...
          </Text>
        </View>
      );
    }

    return (
      <View style={[styles.container, theme?.backgroundColor ? { backgroundColor: theme.backgroundColor } : null, style]}>
        <LegendList
          contentContainerStyle={contentStyle}
          data={blockIds}
          estimatedItemSize={estimatedItemSize}
          extraData={blocksById}
          keyExtractor={(item) => item}
          onLoad={() => {
            hydrateRemainingBlocks(documentState.snapshot, loadVersionRef.current);
          }}
          recycleItems
          renderItem={(props) => (
            <MarkdownBlockRow
              {...props}
              block={blocksById.get(props.item)}
              markdownStyle={resolvedMarkdownStyle}
            />
          )}
          style={styles.list}
        />
      </View>
    );
  },
);

MarkdownDocument.displayName = "MarkdownDocument";

const styles = StyleSheet.create({
  blockRow: {
    paddingHorizontal: 0,
    paddingVertical: 4,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    backgroundColor: "#f5f6f8",
    flex: 1,
  },
  contentContainer: {
    alignSelf: "center",
    maxWidth: 920,
    paddingHorizontal: 40,
    paddingVertical: 48,
    width: "100%",
  },
  errorText: {
    color: "#b42318",
    fontSize: 14,
    padding: 32,
    textAlign: "center",
  },
  list: {
    flex: 1,
  },
  renderedText: {
    width: "100%",
  },
  statusText: {
    color: "#6b7280",
    fontSize: 14,
  },
});

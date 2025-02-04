import React, { useCallback, useMemo } from "react";
import { ReactComponent as MoveIcon } from "@material-design-icons/svg/round/drive_file_move.svg";
import { useRecords, useMoveToFolderDialog, useNavigateFolder } from "@webiny/app-aco";
import { FolderItem } from "@webiny/app-aco/types";
import { observer } from "mobx-react-lite";
import { ContentEntryListConfig } from "~/admin/config/contentEntries";
import { ROOT_FOLDER } from "~/admin/constants";

const ActionMove = () => {
    const { moveRecord } = useRecords();
    const { currentFolderId } = useNavigateFolder();

    const { useWorker, useButtons, useDialog } = ContentEntryListConfig.Browser.BulkAction;
    const { IconButton } = useButtons();
    const worker = useWorker();
    const { showConfirmationDialog, showResultsDialog } = useDialog();
    const { showDialog: showMoveDialog } = useMoveToFolderDialog();

    const entriesLabel = useMemo(() => {
        const count = worker.items.length || 0;
        return `${count} ${count === 1 ? "entry" : "entries"}`;
    }, [worker.items.length]);

    const openWorkerDialog = useCallback(
        (folder: FolderItem) => {
            showConfirmationDialog({
                title: "Move entries",
                message: `You are about to move ${entriesLabel} to ${folder.title}. Are you sure you want to continue?`,
                loadingLabel: `Processing ${entriesLabel}`,
                execute: async () => {
                    await worker.processInSeries(async ({ item, report }) => {
                        try {
                            await moveRecord({
                                id: item.id,
                                location: {
                                    folderId: folder.id
                                }
                            });

                            report.success({
                                title: `${item.meta.title}`,
                                message: "Entry successfully moved."
                            });
                        } catch (e) {
                            report.error({
                                title: `${item.meta.title}`,
                                message: e.message
                            });
                        }
                    });

                    worker.resetItems();

                    showResultsDialog({
                        results: worker.results,
                        title: "Move entries",
                        message: "Operation completed, here below you find the complete report:"
                    });
                }
            });
        },
        [entriesLabel]
    );

    const openMoveEntriesDialog = () =>
        showMoveDialog({
            title: "Select folder",
            message: "Select a new location for selected entries:",
            loadingLabel: `Processing ${entriesLabel}`,
            acceptLabel: `Move`,
            focusedFolderId: currentFolderId || ROOT_FOLDER,
            async onAccept({ folder }) {
                openWorkerDialog(folder);
            }
        });

    return (
        <IconButton
            icon={<MoveIcon />}
            onAction={openMoveEntriesDialog}
            label={`Move ${entriesLabel}`}
            tooltipPlacement={"bottom"}
        />
    );
};

export default observer(ActionMove);

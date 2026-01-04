import { AlertTriangle, Bell, CheckSquare, ClipboardList, MessageSquare, UserCheck, LucideIcon } from "lucide-react";

export interface Notification {
    id: string;
    type: string;
    read: boolean;
    createdAt: string;
    metadata?: Record<string, unknown>;
    comment?: {
        id: string;
        content: string;
        author: { firstName: string; lastName: string };
    } | null;
    annotation?: {
        id: string;
        document: { id: string; title: string; projectId: string };
    } | null;
}

interface NotificationContent {
    icon: LucideIcon;
    text: string;
    link: string | null;
}

export function getNotificationContent(notification: Notification): NotificationContent {
    const normalizedType = notification.type.toLowerCase();

    if (normalizedType === "mc_mention" && notification.metadata) {
        const meta = notification.metadata as {
            senderName?: string;
            projectName?: string;
            protocolLabel?: string;
            itemLabel?: string;
            messagePreview?: string;
            link?: string;
        };

        const summary = [
            meta.senderName ? `${meta.senderName} nevnte deg` : "Du ble nevnt",
            meta.protocolLabel ? `i ${meta.protocolLabel}` : "i MC-protokoll",
            meta.itemLabel ? `– ${meta.itemLabel}` : null,
            meta.projectName ? `(${meta.projectName})` : null,
        ]
            .filter(Boolean)
            .join(" ");

        const preview = meta.messagePreview ? `: “${meta.messagePreview}”` : "";

        return {
            icon: MessageSquare,
            text: `${summary}${preview}`,
            link: meta.link || null,
        };
    }

    if (normalizedType === "mention") {
        const meta = notification.metadata as {
            senderName?: string;
            projectName?: string;
            documentTitle?: string;
            messagePreview?: string;
            link?: string;
        } | null;

        const fallbackAuthor = notification.comment?.author
            ? `${notification.comment.author.firstName} ${notification.comment.author.lastName}`
            : "Noen";

        const senderName = meta?.senderName || fallbackAuthor;
        const docTitle = meta?.documentTitle || notification.annotation?.document?.title || "dokument";
        const projectSuffix = meta?.projectName ? ` (${meta.projectName})` : "";
        const preview =
            meta?.messagePreview || notification.comment?.content
                ? `: “${(meta?.messagePreview || notification.comment?.content || "").slice(0, 120)}”`
                : "";

        const link =
            typeof meta?.link === "string"
                ? meta.link
                : notification.annotation?.document
                    ? `/syslink/projects/${notification.annotation.document.projectId}/documents/${notification.annotation.document.id}`
                    : null;

        return {
            icon: MessageSquare,
            text: `${senderName} nevnte deg i "${docTitle}"${projectSuffix}${preview}`,
            link,
        };
    }

    if (normalizedType === "chat_mention" && notification.metadata) {
        const meta = notification.metadata as {
            senderName?: string;
            roomName?: string;
            roomId?: string;
            projectId?: string;
            projectName?: string;
            messageId?: string;
            messagePreview?: string;
        };
        return {
            icon: MessageSquare,
            text: `${meta.senderName || "Noen"} nevnte deg i #${meta.roomName || "chat"}${meta.projectName ? ` (${meta.projectName})` : ""}${meta.messagePreview ? `: “${meta.messagePreview}”` : ""}`,
            link:
                meta.projectId && meta.roomId && meta.messageId
                    ? `/pratlink/${meta.projectId}?room=${encodeURIComponent(meta.roomId)}&message=${encodeURIComponent(meta.messageId)}`
                    : meta.projectId
                        ? `/pratlink/${meta.projectId}`
                        : null,
        };
    }

    if (normalizedType === "task_assigned" && notification.metadata) {
        const meta = notification.metadata as {
            taskTitle?: string;
            projectName?: string;
            projectId?: string;
            assignerName?: string;
        };
        return {
            icon: CheckSquare,
            text: `${meta.assignerName || "Noen"} tildelte deg en oppgave: "${meta.taskTitle || "Oppgave"}"`,
            link: meta.projectId ? `/pratlink/${meta.projectId}?tab=tasks` : null,
        };
    }

    if (normalizedType === "function_test_assignment" && notification.metadata) {
        const meta = notification.metadata as {
            functionTestId?: string;
            systemCode?: string;
            projectId?: string;
            projectName?: string;
            systemPart?: string;
            function?: string;
            assignedBy?: string;
        };
        return {
            icon: UserCheck,
            text: `${meta.assignedBy || "Noen"} tildelte deg test: "${meta.systemPart || ""} – ${meta.function || ""}" i funksjonstest ${meta.systemCode || ""}${meta.projectName ? ` (${meta.projectName})` : ""}`,
            link: meta.projectId && meta.functionTestId
                ? `/syslink/projects/${meta.projectId}/protocols/function-tests/${meta.functionTestId}`
                : null,
        };
    }

    if (normalizedType === "function_test_deviation" && notification.metadata) {
        const meta = notification.metadata as {
            functionTestId?: string;
            systemCode?: string;
            projectId?: string;
            projectName?: string;
            systemPart?: string;
            function?: string;
            reportedBy?: string;
        };
        return {
            icon: AlertTriangle,
            text: `${meta.reportedBy || "Noen"} registrerte avvik: "${meta.systemPart || ""} – ${meta.function || ""}" i funksjonstest ${meta.systemCode || ""}${meta.projectName ? ` (${meta.projectName})` : ""}`,
            link: meta.projectId && meta.functionTestId
                ? `/syslink/projects/${meta.projectId}/protocols/function-tests/${meta.functionTestId}`
                : null,
        };
    }

    if (normalizedType === "function_test_responsible_added" && notification.metadata) {
        const meta = notification.metadata as {
            functionTestId?: string;
            systemCode?: string;
            projectId?: string;
            projectName?: string;
            addedBy?: string;
            discipline?: string;
            responsibleSystemCode?: string;
        };
        return {
            icon: ClipboardList,
            text: `${meta.addedBy || "Du"} ble lagt til som delansvarlig for ${meta.responsibleSystemCode || ""} (${meta.discipline || ""}) i funksjonstest ${meta.systemCode || ""}${meta.projectName ? ` (${meta.projectName})` : ""}`,
            link: meta.projectId && meta.functionTestId
                ? `/syslink/projects/${meta.projectId}/protocols/function-tests/${meta.functionTestId}`
                : null,
        };
    }

    if (normalizedType === "feedback_warning" && notification.metadata) {
        const meta = notification.metadata as {
            message?: string;
            category?: string;
        };
        const categoryLabel = meta.category ? ` (${meta.category})` : "";
        return {
            icon: AlertTriangle,
            text: `Tilbakemeldingen din ble avvist${categoryLabel}${meta.message ? `: "${meta.message}"` : ""}`,
            link: null,
        };
    }

    if (notification.metadata) {
        const meta = notification.metadata as { message?: string; link?: string };
        if (typeof meta.message === "string" && meta.message.trim()) {
            return {
                icon: Bell,
                text: meta.message,
                link: typeof meta.link === "string" ? meta.link : null,
            };
        }
    }

    return {
        icon: Bell,
        text: "Ny varsling",
        link: null,
    };
}

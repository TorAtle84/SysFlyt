"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
    Users,
    Pencil,
    Trash2,
    Shield,
    Search,
    Loader2,
    CheckCircle,
    Clock,
    XCircle,
    ShieldCheck
} from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface AppAccess {
    status: string;
    application: {
        code: string;
        name: string;
    };
}

interface User {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    company: string | null;
    title: string | null;
    discipline: string | null;
    role: string;
    status: string;
    createdAt: string;
    emailVerified: boolean;
    totpEnabled: boolean;
    appAccess: AppAccess[];
}

interface Application {
    id: string;
    code: string;
    name: string;
}

const ROLES = [
    { value: "READER", label: "Leser" },
    { value: "USER", label: "Bruker" },
    { value: "PROJECT_LEADER", label: "Prosjektleder" },
    { value: "ADMIN", label: "Administrator" },
];

const STATUSES = [
    { value: "PENDING", label: "Ventende" },
    { value: "ACTIVE", label: "Aktiv" },
    { value: "SUSPENDED", label: "Suspendert" },
];

export default function AdminUsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [applications, setApplications] = useState<Application[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState("all");

    // Edit modal state
    const [editUser, setEditUser] = useState<User | null>(null);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editForm, setEditForm] = useState({
        firstName: "",
        lastName: "",
        phone: "",
        company: "",
        title: "",
        discipline: "",
        role: "",
        status: "",
        apps: [] as string[],
    });

    // Delete dialog state
    const [deleteUser, setDeleteUser] = useState<User | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/users?all=true");
            if (!res.ok) throw new Error("Kunne ikke laste brukere");
            const data = await res.json();
            setUsers(data);
        } catch (error) {
            toast.error("Kunne ikke laste brukerliste");
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchApplications = useCallback(async () => {
        try {
            // Fetch from a simple endpoint or use hardcoded values
            // For now, use hardcoded since Application table may not have an API
            setApplications([
                { id: "1", code: "SYSLINK", name: "SysLink" },
                { id: "2", code: "FLYTLINK", name: "FlytLink" },
            ]);
        } catch (error) {
            console.error("Error fetching applications:", error);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
        fetchApplications();
    }, [fetchUsers, fetchApplications]);

    function openEditDialog(user: User) {
        setEditUser(user);
        setEditForm({
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone || "",
            company: user.company || "",
            title: user.title || "",
            discipline: user.discipline || "",
            role: user.role,
            status: user.status,
            apps: user.appAccess
                .filter(a => a.status === "APPROVED")
                .map(a => a.application.code),
        });
        setEditDialogOpen(true);
    }

    async function handleSaveUser() {
        if (!editUser) return;

        setSaving(true);
        try {
            const res = await fetch("/api/admin/users", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: editUser.id,
                    ...editForm,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Kunne ikke oppdatere bruker");
            }

            toast.success("Bruker oppdatert");
            setEditDialogOpen(false);
            setEditUser(null);
            fetchUsers();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Oppdatering feilet");
        } finally {
            setSaving(false);
        }
    }

    async function handleDeleteUser() {
        if (!deleteUser) return;

        setDeleting(true);
        try {
            const res = await fetch(`/api/admin/users?userId=${deleteUser.id}`, {
                method: "DELETE",
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Kunne ikke slette bruker");
            }

            toast.success("Bruker slettet");
            setDeleteDialogOpen(false);
            setDeleteUser(null);
            fetchUsers();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Sletting feilet");
        } finally {
            setDeleting(false);
        }
    }

    // Filter users based on tab and search
    const filteredUsers = users.filter(user => {
        // Tab filter
        if (activeTab !== "all" && user.status !== activeTab.toUpperCase()) {
            return false;
        }

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            return (
                user.firstName.toLowerCase().includes(query) ||
                user.lastName.toLowerCase().includes(query) ||
                user.email.toLowerCase().includes(query) ||
                (user.company?.toLowerCase().includes(query) ?? false)
            );
        }

        return true;
    });

    function getStatusBadge(status: string) {
        switch (status) {
            case "ACTIVE":
                return <Badge className="bg-green-500/20 text-green-500 hover:bg-green-500/30"><CheckCircle className="h-3 w-3 mr-1" />Aktiv</Badge>;
            case "PENDING":
                return <Badge className="bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30"><Clock className="h-3 w-3 mr-1" />Ventende</Badge>;
            case "SUSPENDED":
                return <Badge className="bg-red-500/20 text-red-500 hover:bg-red-500/30"><XCircle className="h-3 w-3 mr-1" />Suspendert</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    }

    function getRoleBadge(role: string) {
        const roleLabel = ROLES.find(r => r.value === role)?.label || role;
        const isAdmin = role === "ADMIN";
        return (
            <Badge variant={isAdmin ? "default" : "outline"} className={isAdmin ? "bg-primary" : ""}>
                {isAdmin && <ShieldCheck className="h-3 w-3 mr-1" />}
                {roleLabel}
            </Badge>
        );
    }

    if (loading) {
        return (
            <AppShell>
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                            <Users className="h-6 w-6" />
                            Brukere
                        </h1>
                        <p className="text-muted-foreground">
                            Administrer alle brukere i systemet
                        </p>
                    </div>
                </div>

                {/* Search and Tabs */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
                        <TabsList>
                            <TabsTrigger value="all">Alle ({users.length})</TabsTrigger>
                            <TabsTrigger value="active">
                                Aktive ({users.filter(u => u.status === "ACTIVE").length})
                            </TabsTrigger>
                            <TabsTrigger value="pending">
                                Ventende ({users.filter(u => u.status === "PENDING").length})
                            </TabsTrigger>
                            <TabsTrigger value="suspended">
                                Suspendert ({users.filter(u => u.status === "SUSPENDED").length})
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Søk etter bruker..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 w-full sm:w-64"
                        />
                    </div>
                </div>

                {/* Users Table */}
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Bruker</TableHead>
                                    <TableHead>Selskap</TableHead>
                                    <TableHead>Rolle</TableHead>
                                    <TableHead>Apps</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>2FA</TableHead>
                                    <TableHead>Registrert</TableHead>
                                    <TableHead className="w-[100px]">Handlinger</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredUsers.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                            Ingen brukere funnet
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredUsers.map((user) => (
                                        <TableRow key={user.id}>
                                            <TableCell>
                                                <div>
                                                    <p className="font-medium">{user.firstName} {user.lastName}</p>
                                                    <p className="text-sm text-muted-foreground">{user.email}</p>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {user.company || "-"}
                                            </TableCell>
                                            <TableCell>{getRoleBadge(user.role)}</TableCell>
                                            <TableCell>
                                                <div className="flex gap-1">
                                                    {user.appAccess
                                                        .filter(a => a.status === "APPROVED")
                                                        .map(a => (
                                                            <Badge key={a.application.code} variant="secondary" className="text-xs">
                                                                {a.application.code === "SYSLINK" ? "S" : "F"}
                                                            </Badge>
                                                        ))}
                                                </div>
                                            </TableCell>
                                            <TableCell>{getStatusBadge(user.status)}</TableCell>
                                            <TableCell>
                                                {user.totpEnabled ? (
                                                    <Shield className="h-4 w-4 text-green-500" />
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {format(new Date(user.createdAt), "d. MMM yyyy", { locale: nb })}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => openEditDialog(user)}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        onClick={() => {
                                                            setDeleteUser(user);
                                                            setDeleteDialogOpen(true);
                                                        }}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Edit Dialog */}
                <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Rediger bruker</DialogTitle>
                            <DialogDescription>
                                E-postadressen kan ikke endres
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Fornavn</Label>
                                    <Input
                                        value={editForm.firstName}
                                        onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Etternavn</Label>
                                    <Input
                                        value={editForm.lastName}
                                        onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>E-post (kan ikke endres)</Label>
                                <Input value={editUser?.email || ""} disabled className="bg-muted" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Telefon</Label>
                                    <Input
                                        value={editForm.phone}
                                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Selskap</Label>
                                    <Input
                                        value={editForm.company}
                                        onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Tittel</Label>
                                    <Input
                                        value={editForm.title}
                                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Fag/Disiplin</Label>
                                    <Input
                                        value={editForm.discipline}
                                        onChange={(e) => setEditForm({ ...editForm, discipline: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Rolle</Label>
                                    <Select
                                        value={editForm.role}
                                        onValueChange={(value) => setEditForm({ ...editForm, role: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {ROLES.map((role) => (
                                                <SelectItem key={role.value} value={role.value}>
                                                    {role.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Status</Label>
                                    <Select
                                        value={editForm.status}
                                        onValueChange={(value) => setEditForm({ ...editForm, status: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {STATUSES.map((status) => (
                                                <SelectItem key={status.value} value={status.value}>
                                                    {status.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Applikasjonstilgang</Label>
                                <div className="flex gap-4 pt-2">
                                    {applications.map((app) => (
                                        <div key={app.code} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`app-${app.code}`}
                                                checked={editForm.apps.includes(app.code)}
                                                onCheckedChange={(checked) => {
                                                    if (checked) {
                                                        setEditForm({ ...editForm, apps: [...editForm.apps, app.code] });
                                                    } else {
                                                        setEditForm({ ...editForm, apps: editForm.apps.filter(c => c !== app.code) });
                                                    }
                                                }}
                                            />
                                            <Label htmlFor={`app-${app.code}`} className="font-normal cursor-pointer">
                                                {app.name}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                                Avbryt
                            </Button>
                            <Button onClick={handleSaveUser} disabled={saving}>
                                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Lagre endringer
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Delete Confirmation */}
                <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Slett bruker?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Er du sikker på at du vil slette bruker {deleteUser?.firstName} {deleteUser?.lastName}?
                                Denne handlingen kan ikke angres.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Avbryt</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleDeleteUser}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Slett bruker
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </AppShell>
    );
}

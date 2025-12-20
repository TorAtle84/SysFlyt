"use client";

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, FileText, Upload, Database, Building2, Save } from "lucide-react";
import { toast } from "sonner";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface FDVModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (productId: string, productName: string, supplierName: string) => void;
    currentProductId?: string | null;
}

export function FDVModal({ open, onOpenChange, onSelect, currentProductId }: FDVModalProps) {
    const [search, setSearch] = useState("");
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState("search");

    // New Entry State
    const [newSupplierName, setNewSupplierName] = useState("");
    const [newProductName, setNewProductName] = useState("");
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");

    useEffect(() => {
        if (open) {
            if (activeTab === "search") searchProducts(search);
            if (activeTab === "new") fetchSuppliers();
        }
    }, [open, activeTab, search]);

    async function searchProducts(query: string) {
        try {
            const res = await fetch(`/api/fdv/products?query=${encodeURIComponent(query)}`);
            const data = await res.json();
            setProducts(data.products || []);
        } catch (err) {
            console.error(err);
        }
    }

    async function fetchSuppliers(query: string = "") {
        try {
            const res = await fetch(`/api/fdv/suppliers?query=${encodeURIComponent(query)}`);
            const data = await res.json();
            setSuppliers(data.suppliers || []);
        } catch (err) {
            console.error(err);
        }
    }

    async function handleCreateSupplier() {
        if (!newSupplierName) return;
        try {
            const res = await fetch("/api/fdv/suppliers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newSupplierName }),
            });
            const data = await res.json();
            if (data.supplier) {
                setSuppliers([...suppliers, data.supplier]);
                setSelectedSupplierId(data.supplier.id);
                setNewSupplierName("");
                toast.success("Leverandør opprettet");
            }
        } catch (err) {
            toast.error("Kunne ikke opprette leverandør");
        }
    }

    async function handleCreateProduct() {
        if (!newProductName || !selectedSupplierId) {
            toast.error("Mangler navn eller leverandør");
            return;
        }
        try {
            const res = await fetch("/api/fdv/products", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newProductName, supplierId: selectedSupplierId }),
            });
            const data = await res.json();
            if (data.product) {
                toast.success("Produkt opprettet");
                // Also select it immediately?
                const supplier = suppliers.find(s => s.id === selectedSupplierId);
                onSelect(data.product.id, data.product.name, supplier?.name || "");
                onOpenChange(false);
            }
        } catch (err) {
            toast.error("Kunne ikke opprette produkt");
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>FDV Håndtering</DialogTitle>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="search">Søk i Database</TabsTrigger>
                        <TabsTrigger value="new">Opprett Nytt</TabsTrigger>
                    </TabsList>

                    <TabsContent value="search" className="space-y-4 py-4">
                        <div className="flex items-center gap-2">
                            <Search className="text-muted-foreground" size={16} />
                            <Input
                                placeholder="Søk etter produkt eller leverandør..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        <div className="h-[300px] overflow-y-auto space-y-2 border rounded-md p-2">
                            {products.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                    <Database className="mb-2 opacity-50" />
                                    <p>Ingen produkter funnet</p>
                                </div>
                            ) : (
                                products.map((prod) => (
                                    <div
                                        key={prod.id}
                                        className="flex items-center justify-between p-3 hover:bg-muted rounded-md cursor-pointer border border-transparent hover:border-border transition-colors"
                                        onClick={() => {
                                            onSelect(prod.id, prod.name, prod.supplier?.name || "");
                                            onOpenChange(false);
                                        }}
                                    >
                                        <div>
                                            <h4 className="font-medium text-sm">{prod.name}</h4>
                                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                <Building2 size={10} />
                                                {prod.supplier?.name || "Ukjent leverandør"}
                                            </p>
                                        </div>
                                        {currentProductId === prod.id && (
                                            <div className="px-2 py-1 bg-primary/10 text-primary text-xs rounded">
                                                Valgt
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="new" className="space-y-4 py-4">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>1. Velg eller opprett leverandør</Label>
                                <div className="flex gap-2">
                                    <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Velg leverandør" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {suppliers.map(s => (
                                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex gap-2 mt-2">
                                    <Input
                                        placeholder="Ny leverandør navn"
                                        value={newSupplierName}
                                        onChange={(e) => setNewSupplierName(e.target.value)}
                                    />
                                    <Button size="icon" onClick={handleCreateSupplier} disabled={!newSupplierName}>
                                        <Plus size={16} />
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>2. Opprett produkt</Label>
                                <Input
                                    placeholder="Produktnavn / Typebetegnelse"
                                    value={newProductName}
                                    onChange={(e) => setNewProductName(e.target.value)}
                                />
                            </div>

                            <Button className="w-full" onClick={handleCreateProduct} disabled={!selectedSupplierId || !newProductName}>
                                <Save className="mr-2 h-4 w-4" />
                                Lagre og Velg
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

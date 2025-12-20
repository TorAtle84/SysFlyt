"use client";

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, FileText, X, Loader2, Search, Plus, Wrench, Link as LinkIcon, CheckSquare } from "lucide-react";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useRouter } from "next/navigation";

interface FDVModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    item: {
        id: string;
        massList?: {
            tfm?: string;
            component?: string;
            typeCode?: string;
        };
        productId?: string;
        product?: {
            id: string;
            name: string;
            supplier: { id: string; name: string };
            datasheets: Array<{ id: string; fileName: string; fileUrl: string; type?: string }>;
        };
    };
    projectId: string;
    protocolId: string;
    onSave: (productId: string | null, product: any) => void;
}

interface Supplier {
    id: string;
    name: string;
}

interface Product {
    id: string;
    name: string;
    supplierId: string;
    supplier?: Supplier;
}

export function FDVModal({
    open,
    onOpenChange,
    item,
    projectId,
    protocolId,
    onSave,
}: FDVModalProps) {
    const router = useRouter();
    const [supplierSearch, setSupplierSearch] = useState("");
    const [productSearch, setProductSearch] = useState("");
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(
        item.product?.supplier || null
    );
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(
        item.product ? { id: item.product.id, name: item.product.name, supplierId: item.product.supplier.id } : null
    );
    const [datasheets, setDatasheets] = useState(item.product?.datasheets || []);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [supplierPopoverOpen, setSupplierPopoverOpen] = useState(false);
    const [productPopoverOpen, setProductPopoverOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("doc");

    // Bulk Linking State
    const [bulkItems, setBulkItems] = useState<any[]>([]);
    const [bulkIds, setBulkIds] = useState<string[]>([]);
    const [bulkSearchTfm, setBulkSearchTfm] = useState("");
    const [isBulkLoading, setIsBulkLoading] = useState(false);
    const [typeCodeCount, setTypeCodeCount] = useState<number | null>(null);
    const [typeCodeItems, setTypeCodeItems] = useState<string[]>([]);

    // Search suppliers
    useEffect(() => {
        if (!supplierSearch) {
            setSuppliers([]);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/fdv/suppliers?query=${encodeURIComponent(supplierSearch)}`);
                if (res.ok) {
                    const data = await res.json();
                    setSuppliers(data.suppliers || []);
                }
            } catch (e) {
                console.error("Error searching suppliers:", e);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [supplierSearch]);

    // Search products globally (with optional supplier filter)
    useEffect(() => {
        if (!productSearch) {
            setProducts([]);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                // Build query - include supplierId if a supplier is selected
                let url = `/api/fdv/products?query=${encodeURIComponent(productSearch)}`;
                if (selectedSupplier) {
                    url += `&supplierId=${selectedSupplier.id}`;
                }
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    setProducts(data.products || []);
                }
            } catch (e) {
                // Silent fail for product search
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [selectedSupplier, productSearch]);

    // Load datasheets when product selected
    useEffect(() => {
        if (!selectedProduct) {
            setDatasheets([]);
            return;
        }

        async function loadDatasheets() {
            try {
                const res = await fetch(`/api/fdv/products/${selectedProduct!.id}/datasheets`);
                if (res.ok) {
                    const data = await res.json();
                    setDatasheets(data.datasheets || []);
                }
            } catch (e) {
                console.error("Error loading datasheets:", e);
            }
        }

        loadDatasheets();
    }, [selectedProduct]);

    async function createSupplier(name: string) {
        try {
            const res = await fetch("/api/fdv/suppliers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            if (res.ok) {
                const { supplier } = await res.json();
                setSelectedSupplier(supplier);
                setSupplierPopoverOpen(false);
                toast.success(`Leverandør "${name}" opprettet`);
            }
        } catch (e) {
            toast.error("Kunne ikke opprette leverandør");
        }
    }

    async function createProduct(name: string) {
        if (!selectedSupplier) return;

        try {
            const res = await fetch(`/api/fdv/products`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, supplierId: selectedSupplier.id }),
            });
            if (res.ok) {
                const { product } = await res.json();
                setSelectedProduct(product);
                setProductPopoverOpen(false);
                toast.success(`Produkt "${name}" opprettet`);
            }
        } catch (e) {
            toast.error("Kunne ikke opprette produkt");
        }
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, type: string) {
        const files = e.target.files;
        if (!files || files.length === 0 || !selectedProduct) return;

        setIsUploading(true);
        let uploadedCount = 0;
        let reusedCount = 0;

        try {
            for (const file of Array.from(files)) {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("type", type);

                const res = await fetch(`/api/fdv/products/${selectedProduct.id}/datasheets`, {
                    method: "POST",
                    body: formData,
                });

                if (res.ok) {
                    const data = await res.json();
                    const { datasheet, reused } = data;
                    setDatasheets((prev) => [...prev, datasheet]);
                    if (reused) {
                        reusedCount++;
                    } else {
                        uploadedCount++;
                    }
                }
            }

            if (uploadedCount > 0 || reusedCount > 0) {
                const typeLabel = type === "INSTALLATION" ? "montasjeanvisninger" : "datablader";
                const messages = [];
                if (uploadedCount > 0) messages.push(`${uploadedCount} ${typeLabel} lastet opp`);
                if (reusedCount > 0) messages.push(`${reusedCount} gjenbrukt`);
                toast.success(messages.join(", "));
            }
        } catch (e) {
            toast.error("Kunne ikke laste opp fil(er)");
        } finally {
            setIsUploading(false);
            e.target.value = "";
        }
    }

    async function handleSave() {
        setIsLoading(true);
        try {
            // First, link any selected items from the bulk search
            if (bulkIds.length > 0 && selectedProduct) {
                const bulkRes = await fetch(`/api/projects/${projectId}/mc-protocols/items/bulk-update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ itemIds: bulkIds, productId: selectedProduct.id })
                });
                if (bulkRes.ok) {
                    const data = await bulkRes.json();
                    toast.success(`Linket ${data.count} komponenter`);
                }
            }

            // Then save the current item
            const res = await fetch(
                `/api/projects/${projectId}/mc-protocols/${protocolId}/items/${item.id}`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ productId: selectedProduct?.id || null }),
                }
            );

            if (res.ok) {
                onSave(selectedProduct?.id || null, selectedProduct ? {
                    ...selectedProduct,
                    supplier: selectedSupplier,
                    datasheets,
                } : null);
                toast.success("FDV lagret");
                onOpenChange(false);
                // Small delay to ensure modal closes before refresh triggers
                setTimeout(() => {
                    router.refresh();
                }, 100);
            }
        } catch (e) {
            toast.error("Kunne ikke lagre FDV");
        } finally {
            setIsLoading(false);
        }
    }

    const componentName = item.massList?.tfm || item.massList?.component || "Komponent";
    const typeCode = item.massList?.typeCode;

    // Check TypeCode matches on mount/change
    useEffect(() => {
        if (typeCode && open) {
            checkTypeCodeMatches();
        }
    }, [typeCode, open, projectId]);

    async function checkTypeCodeMatches() {
        if (!typeCode) return;
        try {
            const res = await fetch(`/api/projects/${projectId}/mc-protocols/items/search?typeCode=${typeCode}`);
            if (res.ok) {
                const data = await res.json();
                setTypeCodeItems(data.items.map((i: any) => i.id));
                setTypeCodeCount(data.items.length);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async function searchBulkItems() {
        if (!bulkSearchTfm) return;
        setIsBulkLoading(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/mc-protocols/items/search?tfmStartsWith=${encodeURIComponent(bulkSearchTfm)}`);
            if (res.ok) {
                const data = await res.json();
                setBulkItems(data.items);
                setBulkIds([]); // Reset selection
            }
        } catch (e) {
            toast.error("Kunne ikke søke");
        } finally {
            setIsBulkLoading(false);
        }
    }

    async function handleBulkLink(ids: string[]) {
        if (!selectedProduct) {
            toast.error("Velg et produkt først");
            return;
        }
        if (ids.length === 0) return;

        setIsBulkLoading(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/mc-protocols/items/bulk-update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemIds: ids, productId: selectedProduct.id })
            });

            if (res.ok) {
                const data = await res.json();
                toast.success(data.message || "Linket komponenter");
                // Refresh counts
                checkTypeCodeMatches();
                if (bulkSearchTfm) searchBulkItems();
                // Small delay to ensure updates are visible
                setTimeout(() => {
                    router.refresh();
                }, 100);
            } else {
                toast.error("Feil ved linking");
            }
        } catch (e) {
            toast.error("Feil ved linking");
        } finally {
            setIsBulkLoading(false);
        }
    }

    const dataSheetsList = datasheets.filter(d => !d.type || d.type === 'DATASHEET');
    const installationList = datasheets.filter(d => d.type === 'INSTALLATION');

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>FDV - {componentName}</DialogTitle>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="doc">Dokumentasjon</TabsTrigger>
                        <TabsTrigger value="link">Koblinger</TabsTrigger>
                    </TabsList>

                    <TabsContent value="doc" className="flex-1 overflow-y-auto space-y-4 py-4 min-h-0">
                        {/* Supplier Autocomplete */}
                        <div className="space-y-2">
                            <Label>Leverandør</Label>
                            <Popover open={supplierPopoverOpen} onOpenChange={setSupplierPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        className="w-full justify-between"
                                    >
                                        {selectedSupplier?.name || "Velg leverandør..."}
                                        <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[400px] max-w-[calc(100vw-2rem)] p-0">
                                    <Command>
                                        <CommandInput
                                            placeholder="Søk leverandør..."
                                            value={supplierSearch}
                                            onValueChange={setSupplierSearch}
                                        />
                                        <CommandList>
                                            <CommandEmpty>
                                                <div className="p-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="w-full justify-start"
                                                        onClick={() => createSupplier(supplierSearch)}
                                                    >
                                                        <Plus className="mr-2 h-4 w-4" />
                                                        Opprett "{supplierSearch}"
                                                    </Button>
                                                </div>
                                            </CommandEmpty>
                                            <CommandGroup>
                                                {suppliers.map((s) => (
                                                    <CommandItem
                                                        key={s.id}
                                                        onSelect={() => {
                                                            setSelectedSupplier(s);
                                                            setSelectedProduct(null);
                                                            setSupplierPopoverOpen(false);
                                                        }}
                                                    >
                                                        {s.name}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* Product Autocomplete */}
                        <div className="space-y-2">
                            <Label>Produkt</Label>
                            <Popover open={productPopoverOpen} onOpenChange={setProductPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        className="w-full justify-between"
                                    >
                                        {selectedProduct?.name || "Velg produkt..."}
                                        <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[400px] max-w-[calc(100vw-2rem)] p-0">
                                    <Command shouldFilter={false}>
                                        <CommandInput
                                            placeholder="Søk produkt..."
                                            value={productSearch}
                                            onValueChange={setProductSearch}
                                        />
                                        <CommandList>
                                            <CommandEmpty>
                                                <div className="p-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="w-full justify-start"
                                                        onClick={() => createProduct(productSearch)}
                                                    >
                                                        <Plus className="mr-2 h-4 w-4" />
                                                        Opprett "{productSearch}"
                                                    </Button>
                                                </div>
                                            </CommandEmpty>
                                            <CommandGroup>
                                                {products.map((p) => (
                                                    <CommandItem
                                                        key={p.id}
                                                        onSelect={() => {
                                                            setSelectedProduct(p);
                                                            // Auto-set supplier if product has supplier info
                                                            if (p.supplier) {
                                                                setSelectedSupplier(p.supplier);
                                                            }
                                                            setProductPopoverOpen(false);
                                                        }}
                                                    >
                                                        <div className="flex flex-col">
                                                            <span>{p.name}</span>
                                                            {p.supplier && (
                                                                <span className="text-xs text-muted-foreground">
                                                                    {p.supplier.name}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* Datasheets */}
                        {selectedProduct && (
                            <>
                                {/* Standard Datasheets */}
                                <div className="space-y-2">
                                    <Label>Datablader</Label>
                                    <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                                        {dataSheetsList.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">Ingen datablader</p>
                                        ) : (
                                            dataSheetsList.map((ds: any) => (
                                                <div key={ds.id} className="flex items-center gap-2 bg-background px-2 py-1 rounded">
                                                    <FileText className="h-4 w-4 text-blue-500" />
                                                    <a href={ds.fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm hover:underline flex-1 truncate">
                                                        {ds.fileName}
                                                    </a>
                                                </div>
                                            ))
                                        )}
                                        <div>
                                            <input
                                                type="file"
                                                id="datasheet-upload"
                                                className="hidden"
                                                accept=".pdf,.doc,.docx"
                                                multiple
                                                onChange={(e) => handleFileUpload(e, "DATASHEET")}
                                            />
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => document.getElementById("datasheet-upload")?.click()}
                                                disabled={isUploading}
                                            >
                                                {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                                                Last opp datablad
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {/* Installation Manuals */}
                                <div className="space-y-2">
                                    <Label>Montasjeanvisninger</Label>
                                    <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                                        {installationList.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">Ingen anvisninger</p>
                                        ) : (
                                            installationList.map((ds: any) => (
                                                <div key={ds.id} className="flex items-center gap-2 bg-background px-2 py-1 rounded">
                                                    <Wrench className="h-4 w-4 text-orange-500" />
                                                    <a href={ds.fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm hover:underline flex-1 truncate">
                                                        {ds.fileName}
                                                    </a>
                                                </div>
                                            ))
                                        )}
                                        <div>
                                            <input
                                                type="file"
                                                id="installation-upload"
                                                className="hidden"
                                                accept=".pdf,.doc,.docx"
                                                multiple
                                                onChange={(e) => handleFileUpload(e, "INSTALLATION")}
                                            />
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => document.getElementById("installation-upload")?.click()}
                                                disabled={isUploading}
                                            >
                                                {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                                                Last opp anvisning
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </TabsContent>

                    <TabsContent value="link" className="flex-1 overflow-y-auto space-y-4 py-4 min-h-0">
                        <div className="bg-blue-50 border border-blue-100 rounded-md p-3 text-sm text-blue-800">
                            {selectedProduct ? (
                                <p><strong>Valgt produkt:</strong> {selectedProduct.name}</p>
                            ) : (
                                <p className="text-red-600 font-medium">Obs: Du må velge et produkt i "Dokumentasjon"-fanen først.</p>
                            )}
                        </div>

                        {/* Bulk Linking Features */}
                        <div className="p-4 border rounded-md bg-muted/20 space-y-3">
                            <h3 className="font-semibold flex items-center gap-2">
                                <LinkIcon className="h-4 w-4" />
                                Link via Typekode
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                Typekode: <strong>{typeCode || "Ingen kode"}</strong>
                            </p>
                            {typeCode && (
                                <div className="flex items-center justify-between">
                                    <span className="text-sm">
                                        Fant <strong>{typeCodeCount ?? "..."}</strong> komponenter med samme kode.
                                    </span>
                                    <Button
                                        size="sm"
                                        disabled={!selectedProduct || !typeCodeCount || isBulkLoading}
                                        onClick={() => handleBulkLink(typeCodeItems)}
                                    >
                                        {isBulkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Link Alle"}
                                    </Button>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border rounded-md space-y-4">
                            <h3 className="font-semibold flex items-center gap-2">
                                <Search className="h-4 w-4" />
                                Søk og Link
                            </h3>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Søk start av TFM (f.eks. RT)..."
                                    className="flex-1"
                                    value={bulkSearchTfm}
                                    onChange={(e) => setBulkSearchTfm(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && searchBulkItems()}
                                />
                                <Button size="sm" variant="secondary" onClick={searchBulkItems} disabled={isBulkLoading}>
                                    {isBulkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Søk"}
                                </Button>
                            </div>

                            <div className="border rounded-md h-60 overflow-y-auto bg-background p-2 space-y-1">
                                {bulkItems.length === 0 ? (
                                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                                        Søk for å vise komponenter...
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2 p-2 border-b bg-muted/40 text-xs font-medium sticky top-0">
                                            <Checkbox
                                                checked={bulkIds.length === bulkItems.length && bulkItems.length > 0}
                                                onCheckedChange={(checked) => {
                                                    if (checked) setBulkIds(bulkItems.map(i => i.id));
                                                    else setBulkIds([]);
                                                }}
                                            />
                                            <span className="w-24">TFM</span>
                                            <span className="flex-1">Komponent</span>
                                            <span className="w-24 hidden sm:block">Nåværende</span>
                                        </div>
                                        {bulkItems.map(item => (
                                            <div key={item.id} className="flex items-center gap-2 p-2 hover:bg-muted/50 text-sm">
                                                <Checkbox
                                                    checked={bulkIds.includes(item.id)}
                                                    onCheckedChange={(checked) => {
                                                        if (checked) setBulkIds(prev => [...prev, item.id]);
                                                        else setBulkIds(prev => prev.filter(id => id !== item.id));
                                                    }}
                                                />
                                                <span className="w-24 font-mono truncate" title={item.tfm}>{item.tfm}</span>
                                                <div className="flex-1 min-w-0">
                                                    <span className="block truncate" title={item.component}>{item.component}</span>
                                                    <span
                                                        className="block truncate text-xs text-muted-foreground sm:hidden"
                                                        title={item.currentProduct || "Ingen"}
                                                    >
                                                        Nåværende: {item.currentProduct || "-"}
                                                    </span>
                                                </div>
                                                <span className="w-24 truncate text-muted-foreground hidden sm:block" title={item.currentProduct || "Ingen"}>
                                                    {item.currentProduct || "-"}
                                                </span>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>

                            <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">Valgt: {bulkIds.length}</span>
                                <Button
                                    size="sm"
                                    disabled={!selectedProduct || bulkIds.length === 0 || isBulkLoading}
                                    onClick={() => handleBulkLink(bulkIds)}
                                >
                                    Link {bulkIds.length} valgte
                                </Button>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>

                <DialogFooter className="mt-auto">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Avbryt
                    </Button>
                    <Button onClick={handleSave} disabled={isLoading}>
                        {isLoading ? "Lagrer..." : "Lagre"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

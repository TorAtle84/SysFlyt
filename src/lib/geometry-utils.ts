export interface Point {
  x: number;
  y: number;
}

export interface Polygon {
  points: Point[];
  color: string;
  systemCode?: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  
  let inside = false;
  const n = polygon.length;
  
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    
    if (
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  
  return inside;
}

export function polygonToBoundingBox(polygon: Point[]): BoundingBox {
  if (polygon.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  for (const point of polygon) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function boundingBoxToPolygon(box: BoundingBox): Point[] {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ];
}

export function calculatePolygonCenter(polygon: Point[]): Point {
  if (polygon.length === 0) {
    return { x: 0, y: 0 };
  }
  
  let sumX = 0;
  let sumY = 0;
  
  for (const point of polygon) {
    sumX += point.x;
    sumY += point.y;
  }
  
  return {
    x: sumX / polygon.length,
    y: sumY / polygon.length,
  };
}

export function calculatePolygonArea(polygon: Point[]): number {
  if (polygon.length < 3) return 0;
  
  let area = 0;
  const n = polygon.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }
  
  return Math.abs(area / 2);
}

export function simplifyPolygon(polygon: Point[], tolerance: number = 1): Point[] {
  if (polygon.length <= 3) return polygon;
  
  const simplified: Point[] = [polygon[0]];
  let lastIncluded = polygon[0];
  
  for (let i = 1; i < polygon.length - 1; i++) {
    const dist = Math.sqrt(
      Math.pow(polygon[i].x - lastIncluded.x, 2) +
      Math.pow(polygon[i].y - lastIncluded.y, 2)
    );
    
    if (dist >= tolerance) {
      simplified.push(polygon[i]);
      lastIncluded = polygon[i];
    }
  }
  
  simplified.push(polygon[polygon.length - 1]);
  
  return simplified;
}

export function getPolygonColors(): string[] {
  return [
    "#3B82F6",
    "#10B981",
    "#F59E0B",
    "#EF4444",
    "#8B5CF6",
    "#EC4899",
    "#06B6D4",
    "#84CC16",
  ];
}

export function getNextPolygonColor(existingColors: string[]): string {
  const allColors = getPolygonColors();
  const usedSet = new Set(existingColors);
  
  for (const color of allColors) {
    if (!usedSet.has(color)) {
      return color;
    }
  }
  
  return allColors[existingColors.length % allColors.length];
}

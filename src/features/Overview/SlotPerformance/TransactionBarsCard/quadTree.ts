// Taken from https://github.com/leeoniya/uPlot/blob/master/demos/lib/quadtree.js

export function pointWithin(
  px: number,
  py: number,
  rlft: number,
  rtop: number,
  rrgt: number,
  rbtm: number,
) {
  return px >= rlft && px <= rrgt && py >= rtop && py <= rbtm;
}

export class Quadtree {
  static MAX_OBJECTS: number = 10; // Maximum objects per node
  static MAX_LEVELS: number = 4; // Maximum levels of the tree

  x: number; // X-coordinate of the node's boundary
  y: number; // Y-coordinate of the node's boundary
  w: number; // Width of the node's boundary
  h: number; // Height of the node's boundary
  l: number; // Current level of the node
  o: Array<{ x: number; y: number; w: number; h: number }>; // Objects stored in this node
  q: Quadtree[] | null; // Children nodes (quadrants)

  constructor(x: number, y: number, w: number, h: number, l: number = 0) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.l = l;
    this.o = [];
    this.q = null;
  }

  // Splits the current node into four child nodes (quadrants)
  private split(): void {
    const w = this.w / 2;
    const h = this.h / 2;
    const l = this.l + 1;

    this.q = [
      new Quadtree(this.x + w, this.y, w, h, l), // Top-right
      new Quadtree(this.x, this.y, w, h, l), // Top-left
      new Quadtree(this.x, this.y + h, w, h, l), // Bottom-left
      new Quadtree(this.x + w, this.y + h, w, h, l), // Bottom-right
    ];
  }

  // Determines which quadrants overlap with a rectangular area
  private quads(
    x: number,
    y: number,
    w: number,
    h: number,
    cb: (quad: Quadtree) => void,
  ): void {
    if (!this.q) return;

    const hzMid = this.x + this.w / 2;
    const vtMid = this.y + this.h / 2;

    const startIsNorth = y < vtMid;
    const startIsWest = x < hzMid;
    const endIsEast = x + w > hzMid;
    const endIsSouth = y + h > vtMid;

    // Callbacks for overlapping quadrants
    startIsNorth && endIsEast && cb(this.q[0]); // Top-right
    startIsWest && startIsNorth && cb(this.q[1]); // Top-left
    startIsWest && endIsSouth && cb(this.q[2]); // Bottom-left
    endIsEast && endIsSouth && cb(this.q[3]); // Bottom-right
  }

  // Adds an object to this node or its children
  add(o: { x: number; y: number; w: number; h: number }): void {
    if (this.q) {
      this.quads(o.x, o.y, o.w, o.h, (quad) => quad.add(o));
    } else {
      this.o.push(o);

      // Split node if capacity is exceeded and below max level
      if (
        this.o.length > Quadtree.MAX_OBJECTS &&
        this.l < Quadtree.MAX_LEVELS
      ) {
        this.split();

        // Redistribute objects in the new child quadrants
        for (const obj of this.o) {
          this.quads(obj.x, obj.y, obj.w, obj.h, (quad) => quad.add(obj));
        }

        // Clear objects in the current node
        this.o.length = 0;
      }
    }
  }

  // Retrieves objects from the given rectangular area
  get(
    x: number,
    y: number,
    w: number,
    h: number,
    cb: (obj: { x: number; y: number; w: number; h: number }) => void,
  ): void {
    for (const obj of this.o) {
      cb(obj);
    }

    if (this.q) {
      this.quads(x, y, w, h, (quad) => quad.get(x, y, w, h, cb));
    }
  }

  // Clears the node and its children
  clear(): void {
    this.o.length = 0;
    this.q = null;
  }
}

// server/src/services/fundamentals.service.js

const { FundamentalsTopic, FundamentalsProgress } = require('../models/Fundamentals.model');

const FIXED_AREAS = ['DSA', 'OOP', 'OS', 'DBMS', 'CN'];

const DEFAULT_CURRICULUM = [
  // --- DSA ---
  {
    id: 'dsa-arrays-strings',
    area: 'DSA',
    name: 'Arrays, Strings & Two Pointers',
    description: 'Fundamental linear data structures, in-place manipulation, substring matching, sliding window techniques.',
    quizEligible: true,
    capstoneProjectSuggestion: 'High-Performance Text Search & In-Memory Tokenizer',
    outline: [
      { point: 'Array memory layout, contiguous allocation, cache locality, and amortized resizing', estimatedMinutes: 30, type: 'conceptual' },
      { point: 'Two-pointer patterns for in-place array partitioning, palindrome check, and deduplication', estimatedMinutes: 45, type: 'practical' },
      { point: 'Sliding window technique for maximum/minimum subsegment and substring analysis', estimatedMinutes: 45, type: 'practical' },
      { point: 'String pattern matching algorithms and character frequency analysis with hash tables', estimatedMinutes: 40, type: 'practical' },
    ],
  },
  {
    id: 'dsa-linked-lists-stacks-queues',
    area: 'DSA',
    name: 'Linked Lists, Stacks & Queues',
    description: 'Dynamic pointer-based linear structures, recursion unwinding, monotonic stacks, and FIFO queue architectures.',
    quizEligible: true,
    capstoneProjectSuggestion: 'Undo/Redo Command Engine with LRU Buffer',
    outline: [
      { point: 'Singly and doubly linked lists: pointer manipulation, reversal, and cycle detection (Floyd’s algorithm)', estimatedMinutes: 45, type: 'practical' },
      { point: 'Stack operations, expression evaluation, matching parentheses, and call stack simulation', estimatedMinutes: 40, type: 'practical' },
      { point: 'Monotonic stack patterns for next greater element and histogram area computation', estimatedMinutes: 45, type: 'practical' },
      { point: 'Circular queues, double-ended queues (deque), and sliding window maximum with deque', estimatedMinutes: 40, type: 'practical' },
    ],
  },
  {
    id: 'dsa-trees-graphs',
    area: 'DSA',
    name: 'Trees, Binary Search Trees & Graphs',
    description: 'Hierarchical node graphs, binary search trees, tree traversals (DFS/BFS), shortest path algorithms, and cycle detection.',
    quizEligible: true,
    capstoneProjectSuggestion: 'Dependency Graph Resolver & Build Task Scheduler',
    outline: [
      { point: 'Binary tree representations and recursive vs iterative traversals (preorder, inorder, postorder, level-order)', estimatedMinutes: 45, type: 'practical' },
      { point: 'Binary Search Tree (BST) invariants, insertion, deletion, and balancing concepts (AVL, Red-Black)', estimatedMinutes: 45, type: 'conceptual' },
      { point: 'Graph representations (adjacency list vs matrix), Breadth-First Search (BFS) and Depth-First Search (DFS)', estimatedMinutes: 50, type: 'practical' },
      { point: 'Topological sort, cycle detection in directed graphs, and Dijkstra’s shortest path algorithm', estimatedMinutes: 50, type: 'practical' },
    ],
  },
  {
    id: 'dsa-dp-greedy',
    area: 'DSA',
    name: 'Dynamic Programming & Greedy Algorithms',
    description: 'Optimal substructure, overlapping subproblems, memoization vs tabulation, state transitions, and greedy choices.',
    quizEligible: true,
    capstoneProjectSuggestion: 'Resource Allocation Optimizer & Knapsack Problem Solver',
    outline: [
      { point: 'Overlapping subproblems, optimal substructure, and memoization vs tabulation approaches', estimatedMinutes: 40, type: 'conceptual' },
      { point: '1D DP: Fibonacci, climbing stairs, house robber, and coin change state transitions', estimatedMinutes: 50, type: 'practical' },
      { point: '2D DP: Longest Common Subsequence (LCS), 0/1 Knapsack, and matrix grid traversals', estimatedMinutes: 55, type: 'practical' },
      { point: 'Greedy choice property, interval scheduling, and comparison between greedy and DP strategies', estimatedMinutes: 45, type: 'practical' },
    ],
  },

  // --- OOP ---
  {
    id: 'oop-principles-solid',
    area: 'OOP',
    name: 'OOP Core Principles & SOLID',
    description: 'Encapsulation, inheritance, polymorphism, abstraction, and the 5 SOLID software design principles.',
    quizEligible: true,
    capstoneProjectSuggestion: 'Extensible Payment Gateway & Billing Processor',
    outline: [
      { point: 'Encapsulation, access modifiers, data hiding, and invariant protection', estimatedMinutes: 30, type: 'conceptual' },
      { point: 'Inheritance vs Composition: IS-A vs HAS-A and avoiding deep hierarchy pitfalls', estimatedMinutes: 40, type: 'conceptual' },
      { point: 'Polymorphism: compile-time (overloading) vs run-time (method overriding, virtual tables)', estimatedMinutes: 40, type: 'conceptual' },
      { point: 'SOLID principles: Single Responsibility, Open-Closed, Liskov Substitution, Interface Segregation, Dependency Inversion', estimatedMinutes: 50, type: 'practical' },
    ],
  },
  {
    id: 'oop-design-patterns',
    area: 'OOP',
    name: 'Creational, Structural & Behavioral Design Patterns',
    description: 'Gang of Four design patterns: Singleton, Factory, Observer, Strategy, Decorator, Adapter.',
    quizEligible: true,
    capstoneProjectSuggestion: 'Multi-Channel Event-Driven Notification System',
    outline: [
      { point: 'Creational patterns: Singleton (thread safety, lazy initialization) and Factory Method / Abstract Factory', estimatedMinutes: 45, type: 'practical' },
      { point: 'Structural patterns: Adapter, Decorator, and Facade for flexible class composition', estimatedMinutes: 45, type: 'practical' },
      { point: 'Behavioral patterns: Observer for event handling and Strategy for swappable business algorithms', estimatedMinutes: 45, type: 'practical' },
      { point: 'Anti-patterns and recognizing over-engineering with design patterns', estimatedMinutes: 30, type: 'conceptual' },
    ],
  },

  // --- OS ---
  {
    id: 'os-processes-threads',
    area: 'OS',
    name: 'Processes, Threads & Concurrency',
    description: 'Process lifecycle, context switching, CPU scheduling, race conditions, synchronization, and deadlock prevention.',
    quizEligible: true,
    capstoneProjectSuggestion: 'Custom Multi-Threaded Worker Queue & Lock Simulator',
    outline: [
      { point: 'Process vs thread: memory layout, process control block (PCB), and context switching overhead', estimatedMinutes: 40, type: 'conceptual' },
      { point: 'CPU scheduling algorithms: FCFS, Round Robin, SJF, Multi-level feedback queues', estimatedMinutes: 35, type: 'conceptual' },
      { point: 'Synchronization primitives: race conditions, critical section problem, mutexes, semaphores, spinlocks', estimatedMinutes: 50, type: 'practical' },
      { point: 'Deadlocks: Coffman conditions, detection, avoidance (Banker’s algorithm), and recovery', estimatedMinutes: 45, type: 'conceptual' },
    ],
  },
  {
    id: 'os-memory-virtualization',
    area: 'OS',
    name: 'Memory Management & Virtual Memory',
    description: 'Contiguous vs non-contiguous memory, paging, page replacement algorithms, TLB, segmentation, and thrashing.',
    quizEligible: true,
    capstoneProjectSuggestion: 'Virtual Memory Page Replacement & Allocator Simulator',
    outline: [
      { point: 'Logical vs physical address space and memory allocation (fixed vs variable partitioning, fragmentation)', estimatedMinutes: 40, type: 'conceptual' },
      { point: 'Paging architecture: page tables, Translation Lookaside Buffer (TLB), and multi-level paging', estimatedMinutes: 45, type: 'conceptual' },
      { point: 'Virtual memory: demand paging, page fault handling lifecycle, and dirty bits', estimatedMinutes: 40, type: 'conceptual' },
      { point: 'Page replacement algorithms (FIFO, LRU, Optimal, Clock) and working set model to prevent thrashing', estimatedMinutes: 45, type: 'practical' },
    ],
  },
  {
    id: 'os-storage-io',
    area: 'OS',
    name: 'File Systems & I/O Multiplexing',
    description: 'Inode architecture, directory structures, disk scheduling, synchronous vs asynchronous I/O, and event loops.',
    quizEligible: true,
    capstoneProjectSuggestion: 'Simple Event-Driven HTTP Request Dispatcher',
    outline: [
      { point: 'File system organization: inodes, hard links vs symbolic links, metadata, and superblock', estimatedMinutes: 40, type: 'conceptual' },
      { point: 'Disk storage, blocks, fragmentation, and disk scheduling algorithms (SCAN, C-SCAN, LOOK)', estimatedMinutes: 35, type: 'conceptual' },
      { point: 'I/O models: blocking vs non-blocking I/O, synchronous vs asynchronous I/O (epoll, select, kqueue)', estimatedMinutes: 45, type: 'conceptual' },
    ],
  },

  // --- DBMS ---
  {
    id: 'dbms-relational-normalization',
    area: 'DBMS',
    name: 'Relational Model & Normalization',
    description: 'Relational schemas, integrity constraints, functional dependencies, 1NF, 2NF, 3NF, BCNF, and denormalization.',
    quizEligible: true,
    capstoneProjectSuggestion: 'Schema Normalization Validator & ER Modeler',
    outline: [
      { point: 'Relational model foundations: relations, tuples, primary keys, candidate keys, and foreign key constraints', estimatedMinutes: 35, type: 'conceptual' },
      { point: 'Functional dependencies, Armstrong axioms, and attribute closure computation', estimatedMinutes: 40, type: 'practical' },
      { point: 'Normalization forms: 1NF, 2NF, 3NF, Boyce-Codd Normal Form (BCNF) and anomaly elimination', estimatedMinutes: 50, type: 'practical' },
      { point: 'Denormalization trade-offs: query read speed vs write anomaly risks in analytical data stores', estimatedMinutes: 30, type: 'conceptual' },
    ],
  },
  {
    id: 'dbms-transactions-acid',
    area: 'DBMS',
    name: 'Transactions, ACID & Concurrency Control',
    description: 'Atomicity, Consistency, Isolation, Durability, write-ahead logging, isolation levels, and two-phase locking.',
    quizEligible: true,
    capstoneProjectSuggestion: 'ACID-Compliant In-Memory Key-Value Transaction Engine',
    outline: [
      { point: 'ACID properties and write-ahead logging (WAL) / undo-redo logs for atomicity and durability', estimatedMinutes: 40, type: 'conceptual' },
      { point: 'Concurrency anomalies: dirty reads, non-repeatable reads, phantom reads, and lost updates', estimatedMinutes: 45, type: 'conceptual' },
      { point: 'SQL transaction isolation levels: Read Uncommitted, Read Committed, Repeatable Read, Serializable', estimatedMinutes: 45, type: 'practical' },
      { point: 'Concurrency control techniques: Two-Phase Locking (2PL), deadlocks in database transactions, and MVCC', estimatedMinutes: 45, type: 'conceptual' },
    ],
  },
  {
    id: 'dbms-indexing-optimization',
    area: 'DBMS',
    name: 'Indexing, B-Trees & Query Optimization',
    description: 'Clustered vs non-clustered indexes, B+ Tree mechanics, composite indexes, query plans, and execution cost.',
    quizEligible: true,
    capstoneProjectSuggestion: 'B+ Tree Index Storage Engine Simulator',
    outline: [
      { point: 'B-Tree and B+ Tree internal structure, node splits, balancing, and range query efficiency', estimatedMinutes: 45, type: 'conceptual' },
      { point: 'Clustered vs non-clustered (secondary) indexes and covering index query optimization', estimatedMinutes: 45, type: 'practical' },
      { point: 'Composite indexes and leftmost prefix rule: designing optimal compound index keys', estimatedMinutes: 40, type: 'practical' },
      { point: 'Query execution plans, table scans vs index seeks, join algorithms (nested loop, hash join, merge join)', estimatedMinutes: 45, type: 'practical' },
    ],
  },

  // --- CN ---
  {
    id: 'cn-models-ip-addressing',
    area: 'CN',
    name: 'Networking Models & IP Addressing',
    description: 'OSI 7-layer architecture, TCP/IP stack, IPv4, IPv6, subnetting, CIDR notation, and packet encapsulation.',
    quizEligible: true,
    capstoneProjectSuggestion: 'IPv4/IPv6 Subnet Calculator & Packet Header Analyzer',
    outline: [
      { point: 'OSI 7-layer model vs TCP/IP 4-layer model: layer responsibilities, PDUs, and encapsulation/decapsulation', estimatedMinutes: 40, type: 'conceptual' },
      { point: 'Data link layer: MAC addressing, ARP protocol, Ethernet frames, and collision/broadcast domains', estimatedMinutes: 40, type: 'conceptual' },
      { point: 'Network layer: IPv4 addressing, subnet masks, CIDR prefix notation, and IP packet headers', estimatedMinutes: 50, type: 'practical' },
      { point: 'IPv6 addressing, NAT (Network Address Translation), and routing fundamentals (OSPF, BGP basics)', estimatedMinutes: 40, type: 'conceptual' },
    ],
  },
  {
    id: 'cn-transport-tcp-udp',
    area: 'CN',
    name: 'Transport Layer Protocols (TCP & UDP)',
    description: 'Connection-oriented vs connectionless transport, three-way handshake, sliding window, flow control, congestion control.',
    quizEligible: true,
    capstoneProjectSuggestion: 'Reliable UDP Protocol Simulator with Retransmissions',
    outline: [
      { point: 'TCP vs UDP: design trade-offs, port numbers, multiplexing, and header structures', estimatedMinutes: 35, type: 'conceptual' },
      { point: 'TCP connection lifecycle: 3-way handshake (SYN, SYN-ACK, ACK), connection termination (FIN/RST), and TIME_WAIT', estimatedMinutes: 45, type: 'practical' },
      { point: 'Reliable transmission: sequence numbers, cumulative ACKs, sliding window protocol, and checksums', estimatedMinutes: 45, type: 'practical' },
      { point: 'TCP Flow control (receive window) vs Congestion control (Slow Start, Congestion Avoidance, Fast Retransmit, Reno/Cubic)', estimatedMinutes: 50, type: 'conceptual' },
    ],
  },
  {
    id: 'cn-application-http-dns',
    area: 'CN',
    name: 'Application Layer (HTTP, DNS & Web Protocols)',
    description: 'DNS resolution mechanics, HTTP/1.1 vs HTTP/2 vs HTTP/3, TLS handshake, cookies, headers, and WebSockets.',
    quizEligible: true,
    capstoneProjectSuggestion: 'Lightweight HTTP/1.1 Proxy with In-Memory DNS Cache',
    outline: [
      { point: 'Domain Name System (DNS): hierarchy, root/TLD/authoritative servers, recursive vs iterative queries, record types (A, AAAA, CNAME, MX)', estimatedMinutes: 45, type: 'practical' },
      { point: 'HTTP protocol: request/response lifecycle, status codes, idempotent methods, persistent connections (Keep-Alive)', estimatedMinutes: 40, type: 'practical' },
      { point: 'HTTP evolution: HTTP/1.1 head-of-line blocking, HTTP/2 binary framing and multiplexing, HTTP/3 QUIC over UDP', estimatedMinutes: 45, type: 'conceptual' },
      { point: 'Transport Layer Security (TLS): asymmetric key exchange, symmetric session encryption, certificates, and TLS 1.3 handshake', estimatedMinutes: 45, type: 'conceptual' },
    ],
  },
];

/**
 * Ensures the fundamentals topics collection is seeded in the database
 */
async function seedFundamentalsIfEmpty() {
  try {
    const count = await FundamentalsTopic.countDocuments();
    if (count === 0) {
      await FundamentalsTopic.insertMany(DEFAULT_CURRICULUM);
      console.log(`✅ Seeded Fundamentals with ${DEFAULT_CURRICULUM.length} topics across 5 areas.`);
    }
  } catch (err) {
    console.warn('[fundamentals.service] Could not check or seed fundamentals topics:', err.message);
  }
}

/**
 * Returns curriculum grouped by the 5 fixed areas along with user progress
 * @param {string} userId
 */
async function getFundamentalsCurriculum(userId = 'dev-user-1') {
  // Query all topics from DB (or fallback to DEFAULT_CURRICULUM if DB empty)
  let topics = await FundamentalsTopic.find().lean();
  if (!topics || topics.length === 0) {
    topics = DEFAULT_CURRICULUM;
  }

  // Fetch user's progress
  const progressEntries = await FundamentalsProgress.find({ userId }).lean();
  const progressMap = new Map(progressEntries.map(p => [p.topicId, p]));

  // Group by area in the fixed order
  const areas = FIXED_AREAS.map(areaName => {
    const areaTopics = topics.filter(t => t.area === areaName);
    const areaProgress = areaTopics.map(t => {
      const existing = progressMap.get(t.id);
      return existing || { userId, topicId: t.id, status: 'not_started' };
    });

    return {
      area: areaName,
      topics: areaTopics,
      progress: areaProgress,
    };
  });

  return { areas };
}

/**
 * Updates a user's progress for a fundamentals topic
 * @param {Object} params - { userId, topicId, status }
 */
async function updateFundamentalsProgress({ userId = 'dev-user-1', topicId, status }) {
  const allowedStatuses = ['not_started', 'in_progress', 'completed', 'verified'];
  if (!allowedStatuses.includes(status)) {
    throw {
      statusCode: 400,
      code: 'INVALID_STATUS',
      message: `Invalid status. Allowed values: ${allowedStatuses.join(', ')}`,
    };
  }

  // Verify topic exists
  let topic = await FundamentalsTopic.findOne({ id: topicId });
  if (!topic) {
    // Check in default curriculum
    topic = DEFAULT_CURRICULUM.find(t => t.id === topicId);
  }
  if (!topic) {
    throw {
      statusCode: 404,
      code: 'TOPIC_NOT_FOUND',
      message: `No fundamentals topic found with ID: ${topicId}`,
    };
  }

  const progress = await FundamentalsProgress.findOneAndUpdate(
    { userId, topicId },
    { status },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return progress;
}

module.exports = {
  FIXED_AREAS,
  DEFAULT_CURRICULUM,
  seedFundamentalsIfEmpty,
  getFundamentalsCurriculum,
  updateFundamentalsProgress,
};

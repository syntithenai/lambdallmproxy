/**
 * Unit tests for TodosManager
 * Tests the backend todo queue management system
 */

const { TodosManager } = require('../src/utils/todos-manager');

describe('TodosManager', () => {
  let manager;
  let emittedEvents;
  let mockWriteEvent;

  beforeEach(() => {
    // Track emitted events
    emittedEvents = [];
    mockWriteEvent = jest.fn((type, data) => {
      emittedEvents.push({ type, data });
    });
    
    manager = new TodosManager(mockWriteEvent);
  });

  describe('constructor', () => {
    test('initializes with empty state', () => {
      const state = manager.getState();
      expect(state.total).toBe(0);
      expect(state.remaining).toBe(0);
      expect(state.current).toBeNull();
      expect(state.items).toEqual([]);
    });

    test('stores writeEvent callback', () => {
      expect(manager.writeEvent).toBe(mockWriteEvent);
    });
  });

  describe('getState', () => {
    test('returns correct state with no todos', () => {
      const state = manager.getState();
      expect(state).toEqual({
        total: 0,
        remaining: 0,
        current: null,
        items: []
      });
    });

    test('returns correct state with pending todos', () => {
      manager.add(['Task A', 'Task B']);
      const state = manager.getState();
      
      expect(state.total).toBe(2);
      expect(state.remaining).toBe(2);
      expect(state.current).toMatchObject({
        id: 1,
        description: 'Task A',
        status: 'current'
      });
    });

    test('returns copies of items to prevent mutation', () => {
      manager.add(['Task A']);
      const state1 = manager.getState();
      const state2 = manager.getState();
      
      // Mutate state1 items
      state1.items[0].description = 'Modified';
      
      // state2 should be unaffected
      expect(state2.items[0].description).toBe('Task A');
    });

    test('calculates remaining count correctly', () => {
      manager.add(['Task A', 'Task B', 'Task C']);
      manager.completeCurrent(); // Complete Task A
      
      const state = manager.getState();
      expect(state.total).toBe(3);
      expect(state.remaining).toBe(2); // Task B (current) + Task C (pending)
      expect(state.items.filter(i => i.status === 'done').length).toBe(1);
    });
  });

  describe('add', () => {
    test('adds single todo', () => {
      const state = manager.add(['Task A']);
      
      expect(state.total).toBe(1);
      expect(state.items[0]).toMatchObject({
        id: 1,
        description: 'Task A',
        status: 'current'
      });
    });

    test('adds multiple todos', () => {
      const state = manager.add(['Task A', 'Task B', 'Task C']);
      
      expect(state.total).toBe(3);
      expect(state.items).toHaveLength(3);
      expect(state.items[0].status).toBe('current');
      expect(state.items[1].status).toBe('pending');
      expect(state.items[2].status).toBe('pending');
    });

    test('sets first todo as current', () => {
      manager.add(['Task A', 'Task B']);
      const state = manager.getState();
      
      expect(state.current).toMatchObject({
        id: 1,
        description: 'Task A',
        status: 'current'
      });
    });

    test('preserves current todo when adding more', () => {
      manager.add(['Task A']);
      manager.add(['Task B', 'Task C']);
      
      const state = manager.getState();
      expect(state.current.id).toBe(1); // Task A still current
      expect(state.total).toBe(3);
    });

    test('auto-increments IDs', () => {
      manager.add(['Task A', 'Task B', 'Task C']);
      const state = manager.getState();
      
      expect(state.items[0].id).toBe(1);
      expect(state.items[1].id).toBe(2);
      expect(state.items[2].id).toBe(3);
    });

    test('trims whitespace from descriptions', () => {
      manager.add(['  Task A  ', '\tTask B\n']);
      const state = manager.getState();
      
      expect(state.items[0].description).toBe('Task A');
      expect(state.items[1].description).toBe('Task B');
    });

    test('filters out empty descriptions', () => {
      manager.add(['Task A', '', '  ', 'Task B', null, undefined]);
      const state = manager.getState();
      
      expect(state.total).toBe(2); // Only Task A and Task B
      expect(state.items.map(i => i.description)).toEqual(['Task A', 'Task B']);
    });

    test('emits todos_updated event', () => {
      manager.add(['Task A']);
      
      expect(mockWriteEvent).toHaveBeenCalledWith('todos_updated', expect.objectContaining({
        total: 1,
        remaining: 1
      }));
    });

    test('emits todos_current event', () => {
      manager.add(['Task A']);
      
      expect(mockWriteEvent).toHaveBeenCalledWith('todos_current', expect.objectContaining({
        current: expect.objectContaining({ description: 'Task A' }),
        remaining: 1,
        total: 1
      }));
    });

    test('handles non-array input gracefully', () => {
      const state = manager.add('not an array');
      expect(state.total).toBe(0);
    });

    test('handles null/undefined input', () => {
      const state1 = manager.add(null);
      const state2 = manager.add(undefined);
      const state3 = manager.add();
      
      expect(state1.total).toBe(0);
      expect(state2.total).toBe(0);
      expect(state3.total).toBe(0);
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      manager.add(['Task A', 'Task B', 'Task C']);
      emittedEvents = []; // Clear events from setup
      mockWriteEvent.mockClear();
    });

    test('deletes todo by id', () => {
      const state = manager.delete([1]); // Delete Task A
      
      expect(state.total).toBe(2);
      expect(state.items.map(i => i.description)).toEqual(['Task B', 'Task C']);
    });

    test('deletes todo by description', () => {
      const state = manager.delete(['Task B']);
      
      expect(state.total).toBe(2);
      expect(state.items.map(i => i.description)).toEqual(['Task A', 'Task C']);
    });

    test('deletes multiple todos', () => {
      const state = manager.delete([1, 'Task C']); // Delete Task A by id, Task C by description
      
      expect(state.total).toBe(1);
      expect(state.items[0].description).toBe('Task B');
    });

    test('re-activates current if current is deleted', () => {
      const state = manager.delete([1]); // Delete current (Task A)
      
      expect(state.current).toMatchObject({
        id: 2,
        description: 'Task B',
        status: 'current'
      });
    });

    test('sets next pending as current when current deleted', () => {
      manager.completeCurrent(); // Task A done, Task B current
      manager.delete([2]); // Delete Task B (current)
      
      const state = manager.getState();
      expect(state.current).toMatchObject({
        id: 3,
        description: 'Task C',
        status: 'current'
      });
    });

    test('handles deleting non-existent todo', () => {
      const state = manager.delete(['Non-existent']);
      expect(state.total).toBe(3); // No change
    });

    test('handles deleting by non-existent id', () => {
      const state = manager.delete([999]);
      expect(state.total).toBe(3); // No change
    });

    test('emits events after deletion', () => {
      manager.delete([1]);
      
      expect(mockWriteEvent).toHaveBeenCalledWith('todos_updated', expect.any(Object));
      expect(mockWriteEvent).toHaveBeenCalledWith('todos_current', expect.any(Object));
    });

    test('handles non-array input gracefully', () => {
      const state = manager.delete('not an array');
      expect(state.total).toBe(3); // No change
    });

    test('converts numeric ids to strings for comparison', () => {
      const state = manager.delete(['1']); // String '1' should match id 1
      expect(state.total).toBe(2);
    });
  });

  describe('completeCurrent', () => {
    beforeEach(() => {
      manager.add(['Task A', 'Task B', 'Task C']);
      emittedEvents = [];
      mockWriteEvent.mockClear();
    });

    test('marks current as done', () => {
      manager.completeCurrent();
      const state = manager.getState();
      
      const taskA = state.items.find(i => i.id === 1);
      expect(taskA.status).toBe('done');
    });

    test('advances to next pending', () => {
      manager.completeCurrent();
      const state = manager.getState();
      
      expect(state.current).toMatchObject({
        id: 2,
        description: 'Task B',
        status: 'current'
      });
    });

    test('handles completing last todo', () => {
      manager.completeCurrent(); // Complete Task A
      manager.completeCurrent(); // Complete Task B
      manager.completeCurrent(); // Complete Task C
      
      const state = manager.getState();
      expect(state.current).toBeNull();
      expect(state.remaining).toBe(0);
      expect(state.items.every(i => i.status === 'done')).toBe(true);
    });

    test('handles completing when no current exists', () => {
      manager.clear();
      const state = manager.completeCurrent();
      
      expect(state.current).toBeNull();
      expect(state.total).toBe(0);
    });

    test('emits events after completion', () => {
      manager.completeCurrent();
      
      expect(mockWriteEvent).toHaveBeenCalledWith('todos_updated', expect.objectContaining({
        remaining: 2
      }));
      expect(mockWriteEvent).toHaveBeenCalledWith('todos_current', expect.objectContaining({
        current: expect.objectContaining({ id: 2 })
      }));
    });

    test('updates remaining count correctly', () => {
      manager.completeCurrent();
      const state = manager.getState();
      
      expect(state.remaining).toBe(2); // Task B (current) + Task C (pending)
    });
  });

  describe('hasPending', () => {
    test('returns true with pending todos', () => {
      manager.add(['Task A', 'Task B']);
      expect(manager.hasPending()).toBe(true);
    });

    test('returns true with current todo', () => {
      manager.add(['Task A']);
      expect(manager.hasPending()).toBe(true);
    });

    test('returns false when all done', () => {
      manager.add(['Task A']);
      manager.completeCurrent();
      expect(manager.hasPending()).toBe(false);
    });

    test('returns false with no todos', () => {
      expect(manager.hasPending()).toBe(false);
    });
  });

  describe('getCurrent', () => {
    test('returns current todo', () => {
      manager.add(['Task A', 'Task B']);
      const current = manager.getCurrent();
      
      expect(current).toMatchObject({
        id: 1,
        description: 'Task A',
        status: 'current'
      });
    });

    test('returns null when no current', () => {
      expect(manager.getCurrent()).toBeNull();
    });

    test('returns null when all done', () => {
      manager.add(['Task A']);
      manager.completeCurrent();
      expect(manager.getCurrent()).toBeNull();
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      manager.add(['Task A', 'Task B', 'Task C']);
      emittedEvents = [];
      mockWriteEvent.mockClear();
    });

    test('removes all todos', () => {
      manager.clear();
      const state = manager.getState();
      
      expect(state.total).toBe(0);
      expect(state.items).toEqual([]);
    });

    test('resets nextId counter', () => {
      manager.clear();
      manager.add(['New Task']);
      
      const state = manager.getState();
      expect(state.items[0].id).toBe(1); // ID restarted at 1
    });

    test('emits todos_updated event', () => {
      manager.clear();
      
      expect(mockWriteEvent).toHaveBeenCalledWith('todos_updated', expect.objectContaining({
        total: 0,
        remaining: 0
      }));
    });
  });

  describe('SSE event emission', () => {
    test('handles missing writeEvent gracefully', () => {
      const managerNoEvent = new TodosManager(null);
      expect(() => {
        managerNoEvent.add(['Task A']);
      }).not.toThrow();
    });

    test('handles writeEvent errors gracefully', () => {
      const errorEvent = jest.fn(() => {
        throw new Error('Event error');
      });
      const managerErrorEvent = new TodosManager(errorEvent);
      
      expect(() => {
        managerErrorEvent.add(['Task A']);
      }).not.toThrow();
    });

    test('emits events in correct order for add', () => {
      manager.add(['Task A']);
      
      const eventTypes = emittedEvents.map(e => e.type);
      expect(eventTypes).toEqual(['todos_updated', 'todos_current']);
    });

    test('includes correct data in todos_updated event', () => {
      manager.add(['Task A', 'Task B']);
      
      const updateEvent = emittedEvents.find(e => e.type === 'todos_updated');
      expect(updateEvent.data).toMatchObject({
        total: 2,
        remaining: 2,
        current: expect.objectContaining({ description: 'Task A' }),
        items: expect.arrayContaining([
          expect.objectContaining({ description: 'Task A' }),
          expect.objectContaining({ description: 'Task B' })
        ])
      });
    });

    test('includes correct data in todos_current event', () => {
      manager.add(['Task A', 'Task B']);
      
      const currentEvent = emittedEvents.find(e => e.type === 'todos_current');
      expect(currentEvent.data).toMatchObject({
        current: expect.objectContaining({ description: 'Task A' }),
        remaining: 2,
        total: 2
      });
    });
  });

  describe('edge cases', () => {
    test('handles adding todos after all completed', () => {
      manager.add(['Task A']);
      manager.completeCurrent();
      manager.add(['Task B']);
      
      const state = manager.getState();
      expect(state.current).toMatchObject({
        id: 2,
        description: 'Task B'
      });
      expect(state.total).toBe(2);
    });

    test('handles mixed add and delete operations', () => {
      manager.add(['Task A', 'Task B']);
      manager.delete([1]);
      manager.add(['Task C']);
      
      const state = manager.getState();
      expect(state.total).toBe(2);
      expect(state.items.map(i => i.description)).toEqual(['Task B', 'Task C']);
    });

    test('maintains consistent state through multiple operations', () => {
      manager.add(['Task A', 'Task B', 'Task C']);
      manager.completeCurrent(); // A done, B current
      manager.add(['Task D']);
      manager.delete(['Task C']);
      manager.completeCurrent(); // B done, D current
      
      const state = manager.getState();
      expect(state.total).toBe(3); // A, B, D
      expect(state.remaining).toBe(1); // Only D
      expect(state.current.description).toBe('Task D');
      expect(state.items.filter(i => i.status === 'done').length).toBe(2);
    });

    test('handles very long descriptions', () => {
      const longDescription = 'A'.repeat(10000);
      manager.add([longDescription]);
      
      const state = manager.getState();
      expect(state.items[0].description).toBe(longDescription);
    });

    test('handles special characters in descriptions', () => {
      manager.add(['Task "A"', "Task 'B'", 'Task <C>', 'Task & D']);
      const state = manager.getState();
      
      expect(state.total).toBe(4);
      expect(state.items[0].description).toBe('Task "A"');
    });

    test('handles Unicode characters', () => {
      manager.add(['Task 🚀', 'Task 中文', 'Task עברית']);
      const state = manager.getState();
      
      expect(state.total).toBe(3);
      expect(state.items[0].description).toBe('Task 🚀');
    });
  });

  describe('integration scenarios', () => {
    test('simulates full todo workflow', () => {
      // Add initial todos
      manager.add(['Implement feature', 'Write tests', 'Update docs']);
      expect(manager.getState().remaining).toBe(3);
      
      // Complete first todo
      manager.completeCurrent();
      expect(manager.getState().current.description).toBe('Write tests');
      
      // Add another todo mid-workflow
      manager.add(['Deploy to staging']);
      expect(manager.getState().total).toBe(4);
      
      // Complete remaining
      manager.completeCurrent(); // Write tests
      manager.completeCurrent(); // Update docs
      manager.completeCurrent(); // Deploy to staging
      
      const final = manager.getState();
      expect(final.remaining).toBe(0);
      expect(final.current).toBeNull();
      expect(final.items.every(i => i.status === 'done')).toBe(true);
    });

    test('simulates auto-progression with assessor', () => {
      // Setup todos
      manager.add(['Step 1', 'Step 2', 'Step 3']);
      
      // Simulate assessor checking each step
      for (let i = 0; i < 3; i++) {
        const current = manager.getCurrent();
        expect(current).not.toBeNull();
        
        // Assessor returns OK, complete current
        manager.completeCurrent();
      }
      
      expect(manager.hasPending()).toBe(false);
    });
  });
});

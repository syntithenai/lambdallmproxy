/**
 * Unit Tests for TodosManager
 * 
 * Tests the backend-managed todo queue for multi-step workflows
 */

const { TodosManager } = require('../../src/utils/todos-manager');

describe('TodosManager', () => {
  let manager;
  let emittedEvents;

  beforeEach(() => {
    emittedEvents = [];
    const writeEvent = (type, data) => {
      emittedEvents.push({ type, data });
    };
    manager = new TodosManager(writeEvent);
  });

  describe('initialization', () => {
    it('should start with empty state', () => {
      const state = manager.getState();
      expect(state).toEqual({
        total: 0,
        remaining: 0,
        current: null,
        items: []
      });
    });

    it('should not emit events on initialization', () => {
      expect(emittedEvents.length).toBe(0);
    });
  });

  describe('add()', () => {
    it('should add todos and activate first as current', () => {
      const state = manager.add(['Task 1', 'Task 2', 'Task 3']);
      
      expect(state.total).toBe(3);
      expect(state.remaining).toBe(3);
      expect(state.current).toBeTruthy();
      expect(state.current.description).toBe('Task 1');
      expect(state.current.status).toBe('current');
      expect(state.items.length).toBe(3);
      expect(state.items[0].status).toBe('current');
      expect(state.items[1].status).toBe('pending');
      expect(state.items[2].status).toBe('pending');
    });

    it('should emit todos_updated and todos_current events', () => {
      manager.add(['Task 1', 'Task 2']);
      
      expect(emittedEvents.length).toBe(2);
      expect(emittedEvents[0].type).toBe('todos_updated');
      expect(emittedEvents[0].data.total).toBe(2);
      expect(emittedEvents[1].type).toBe('todos_current');
      expect(emittedEvents[1].data.remaining).toBe(2);
    });

    it('should handle empty array gracefully', () => {
      const state = manager.add([]);
      
      expect(state.total).toBe(0);
      expect(emittedEvents.length).toBe(2); // Still emits events
    });

    it('should filter out empty or whitespace-only descriptions', () => {
      const state = manager.add(['Task 1', '', '  ', 'Task 2']);
      
      expect(state.total).toBe(2);
      expect(state.items[0].description).toBe('Task 1');
      expect(state.items[1].description).toBe('Task 2');
    });

    it('should not activate current if one already exists', () => {
      manager.add(['Task 1']);
      const state = manager.add(['Task 2']);
      
      // First task should still be current
      expect(state.current.description).toBe('Task 1');
      expect(state.items[0].status).toBe('current');
      expect(state.items[1].status).toBe('pending');
    });

    it('should assign sequential IDs', () => {
      const state = manager.add(['Task 1', 'Task 2', 'Task 3']);
      
      expect(state.items[0].id).toBe(1);
      expect(state.items[1].id).toBe(2);
      expect(state.items[2].id).toBe(3);
    });
  });

  describe('delete()', () => {
    beforeEach(() => {
      manager.add(['Task 1', 'Task 2', 'Task 3']);
      emittedEvents = []; // Clear events from add
    });

    it('should delete todos by id', () => {
      const state = manager.delete([2]);
      
      expect(state.total).toBe(2);
      expect(state.items.length).toBe(2);
      expect(state.items[0].description).toBe('Task 1');
      expect(state.items[1].description).toBe('Task 3');
    });

    it('should delete todos by exact description', () => {
      const state = manager.delete(['Task 2']);
      
      expect(state.total).toBe(2);
      expect(state.items.find(i => i.description === 'Task 2')).toBeUndefined();
    });

    it('should emit todos_updated and todos_current events', () => {
      manager.delete([2]);
      
      expect(emittedEvents.length).toBe(2);
      expect(emittedEvents[0].type).toBe('todos_updated');
      expect(emittedEvents[1].type).toBe('todos_current');
    });

    it('should reactivate current if current item is deleted', () => {
      // Delete the current item (Task 1)
      const state = manager.delete([1]);
      
      // Task 2 should now be current
      expect(state.current.description).toBe('Task 2');
      expect(state.current.status).toBe('current');
    });

    it('should handle empty delete array', () => {
      const stateBefore = manager.getState();
      const stateAfter = manager.delete([]);
      
      expect(stateAfter.total).toBe(stateBefore.total);
    });

    it('should handle non-existent ids gracefully', () => {
      const state = manager.delete([999]);
      
      expect(state.total).toBe(3); // Nothing deleted
    });
  });

  describe('completeCurrent()', () => {
    beforeEach(() => {
      manager.add(['Task 1', 'Task 2', 'Task 3']);
      emittedEvents = []; // Clear events from add
    });

    it('should mark current as done and advance to next', () => {
      const state = manager.completeCurrent();
      
      expect(state.items[0].status).toBe('done');
      expect(state.items[1].status).toBe('current');
      expect(state.items[2].status).toBe('pending');
      expect(state.current.description).toBe('Task 2');
      expect(state.remaining).toBe(2);
    });

    it('should emit todos_updated and todos_current events', () => {
      manager.completeCurrent();
      
      expect(emittedEvents.length).toBe(2);
      expect(emittedEvents[0].type).toBe('todos_updated');
      expect(emittedEvents[1].type).toBe('todos_current');
    });

    it('should handle completing last todo', () => {
      manager.completeCurrent(); // Complete Task 1
      manager.completeCurrent(); // Complete Task 2
      const state = manager.completeCurrent(); // Complete Task 3
      
      expect(state.items.every(i => i.status === 'done')).toBe(true);
      expect(state.current).toBeNull();
      expect(state.remaining).toBe(0);
    });

    it('should do nothing if no current todo', () => {
      manager.clear();
      const state = manager.completeCurrent();
      
      expect(state.total).toBe(0);
      expect(state.current).toBeNull();
    });
  });

  describe('hasPending()', () => {
    it('should return true when there are pending todos', () => {
      manager.add(['Task 1', 'Task 2']);
      expect(manager.hasPending()).toBe(true);
    });

    it('should return true when there is a current todo', () => {
      manager.add(['Task 1']);
      expect(manager.hasPending()).toBe(true);
    });

    it('should return false when all todos are done', () => {
      manager.add(['Task 1']);
      manager.completeCurrent();
      expect(manager.hasPending()).toBe(false);
    });

    it('should return false when there are no todos', () => {
      expect(manager.hasPending()).toBe(false);
    });
  });

  describe('getCurrent()', () => {
    it('should return current todo', () => {
      manager.add(['Task 1', 'Task 2']);
      const current = manager.getCurrent();
      
      expect(current).toBeTruthy();
      expect(current.description).toBe('Task 1');
      expect(current.status).toBe('current');
    });

    it('should return null when no current todo', () => {
      expect(manager.getCurrent()).toBeNull();
    });
  });

  describe('clear()', () => {
    it('should clear all todos', () => {
      manager.add(['Task 1', 'Task 2', 'Task 3']);
      const state = manager.clear();
      
      expect(state.total).toBe(0);
      expect(state.items.length).toBe(0);
      expect(state.current).toBeNull();
    });

    it('should emit todos_updated event', () => {
      manager.add(['Task 1']);
      emittedEvents = [];
      manager.clear();
      
      expect(emittedEvents.length).toBe(1);
      expect(emittedEvents[0].type).toBe('todos_updated');
    });

    it('should reset ID counter', () => {
      manager.add(['Task 1']);
      manager.clear();
      const state = manager.add(['Task 2']);
      
      // ID should restart from 1
      expect(state.items[0].id).toBe(1);
    });
  });

  describe('event emission', () => {
    it('should handle writeEvent being null', () => {
      const managerNoEvents = new TodosManager(null);
      
      // Should not throw
      expect(() => managerNoEvents.add(['Task 1'])).not.toThrow();
    });

    it('should handle writeEvent throwing errors', () => {
      const throwingEvent = () => {
        throw new Error('Event emission failed');
      };
      const managerWithErrors = new TodosManager(throwingEvent);
      
      // Should not throw - errors are caught internally
      expect(() => managerWithErrors.add(['Task 1'])).not.toThrow();
    });
  });

  describe('state immutability', () => {
    it('should return copies of items array', () => {
      manager.add(['Task 1', 'Task 2']);
      const state1 = manager.getState();
      const state2 = manager.getState();
      
      // Should be different array instances
      expect(state1.items).not.toBe(state2.items);
      // But with same content
      expect(state1.items).toEqual(state2.items);
    });

    it('should not allow mutation of returned state', () => {
      manager.add(['Task 1', 'Task 2']);
      const state = manager.getState();
      
      // Try to mutate returned state
      state.items[0].description = 'Modified';
      
      // Original should be unchanged
      const freshState = manager.getState();
      expect(freshState.items[0].description).toBe('Task 1');
    });
  });
});

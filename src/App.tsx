/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable jsx-a11y/control-has-associated-label */
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { UserWarning } from './UserWarning';
import {
  addTodos,
  deleteTodos,
  getTodos,
  updateTodos,
  USER_ID,
} from './api/todos';
import { Todo } from './types/Todo';
import classNames from 'classnames';

enum ErrorMessage {
  Load = 'Unable to load todos',
  Empty = 'Title should not be empty',
  Add = 'Unable to add a todo',
  Delete = 'Unable to delete a todo',
  Update = 'Unable to update a todo',
}

enum TodoFilter {
  All = 'All',
  Active = 'Active',
  Completed = 'Completed',
}

export const App: React.FC = () => {
  const [error, setError] = useState('');

  const [todos, setTodos] = useState<Todo[]>([]);
  const [draftTodo, setDraftTodo] = useState<Todo | null>(null);

  const [filter, setFilter] = useState(TodoFilter.All);

  const [newTitle, setNewTitle] = useState('');
  const [inputDisabled, setInputDisabled] = useState(false);

  const [editId, setEditId] = useState<number | null>(null);
  const [pendingIds, setPendingIds] = useState<number[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const editFieldRef = useRef<HTMLInputElement>(null);

  const filterTodos = useCallback((list: Todo[], type: string): Todo[] => {
    switch (type) {
      case TodoFilter.Active:
        return list.filter(todo => !todo.completed);
      case TodoFilter.Completed:
        return list.filter(todo => todo.completed);
      default:
        return list;
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const list = await getTodos();

        setTodos(list);
      } catch {
        setError(ErrorMessage.Load);
      }
    })();
  }, []);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 3000);

      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleAdd = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (!newTitle.trim()) {
        setError(ErrorMessage.Empty);

        return;
      }

      const newTodo: Todo = {
        id: 0,
        title: newTitle.trim(),
        completed: false,
        userId: USER_ID,
      };

      setDraftTodo(newTodo);

      try {
        setInputDisabled(true);
        const saved = await addTodos(newTodo);

        setTodos(prev => [...prev, saved]);
        setNewTitle('');
      } catch {
        setTodos(prev => prev.filter(todo => todo.id !== 0));
        setError(ErrorMessage.Add);
      } finally {
        setInputDisabled(false);
        setDraftTodo(null);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    },
    [newTitle],
  );

  const handleDelete = useCallback(async (id: number) => {
    setPendingIds(prev => [...prev, id]);
    try {
      await deleteTodos(id);
      setTodos(prev => prev.filter(todo => todo.id !== id));

      return true;
    } catch {
      setError(ErrorMessage.Delete);

      return false;
    } finally {
      setPendingIds(prev => prev.filter(todoId => todoId !== id));
      inputRef.current?.focus();
    }
  }, []);

  const handleUpdate = useCallback(async (id: number, data: Partial<Todo>) => {
    setPendingIds(prev => [...prev, id]);
    try {
      const updated = await updateTodos(id, data);

      setTodos(prev => prev.map(todo => (todo.id === id ? updated : todo)));

      return true;
    } catch {
      setError(ErrorMessage.Update);

      return false;
    } finally {
      setPendingIds(prev => prev.filter(todoId => todoId !== id));
    }
  }, []);

  const handleClearCompleted = useCallback(async () => {
    const completed = todos.filter(t => t.completed);
    const ids = completed.map(t => t.id);

    if (!ids.length) {
      return;
    }

    setPendingIds(prev => [...prev, ...ids]);
    try {
      const results = await Promise.allSettled(
        completed.map(t => deleteTodos(t.id)),
      );

      const successful = completed
        .filter((_, i) => results[i].status === 'fulfilled')
        .map(t => t.id);

      if (successful.length > 0) {
        setTodos(prev => prev.filter(t => !successful.includes(t.id)));
      }

      if (results.some(r => r.status === 'rejected')) {
        setError(ErrorMessage.Delete);
      }
    } catch {
      setError(ErrorMessage.Delete);
    } finally {
      setPendingIds(prev => prev.filter(id => !ids.includes(id)));
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [todos]);

  const allCompleted = useMemo(
    () => todos.length > 0 && todos.every(t => t.completed),
    [todos],
  );

  const handleToggleAll = useCallback(async () => {
    const target = !allCompleted;
    const toUpdate = todos.filter(t => t.completed !== target);

    if (!toUpdate.length) {
      return;
    }

    const ids = toUpdate.map(t => t.id);

    setPendingIds(prev => [...prev, ...ids]);

    try {
      await Promise.all(
        toUpdate.map(t => updateTodos(t.id, { completed: target })),
      );
      setTodos(prev => prev.map(t => ({ ...t, completed: target })));
    } catch {
      setError(ErrorMessage.Update);
    } finally {
      setPendingIds(prev => prev.filter(id => !ids.includes(id)));
    }
  }, [allCompleted, todos]);

  const handleEdit = useCallback((id: number) => {
    setEditId(id);
    setTimeout(() => editFieldRef.current?.focus(), 0);
  }, []);

  const handleSave = useCallback(
    async (id: number, newValue: string, oldValue: string) => {
      const trimmed = newValue.trim();

      if (!trimmed) {
        const removed = await handleDelete(id);

        if (!removed) {
          return;
        }
      } else if (trimmed !== oldValue) {
        const ok = await handleUpdate(id, { title: trimmed });

        if (!ok) {
          return;
        }
      }

      setEditId(null);
    },
    [handleDelete, handleUpdate],
  );

  const handleFormSave = useCallback(
    async (e: React.FormEvent<HTMLFormElement>, id: number, old: string) => {
      e.preventDefault();
      const input = e.currentTarget.elements[0] as HTMLInputElement;

      await handleSave(id, input.value, old);
    },
    [handleSave],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        setEditId(null);
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
    [],
  );

  const renderTodos = useMemo(
    () => (draftTodo ? [...todos, draftTodo] : todos),
    [todos, draftTodo],
  );

  const filtered = useMemo(
    () => filterTodos(renderTodos, filter),
    [filterTodos, renderTodos, filter],
  );

  const activeItems = useMemo(() => todos.filter(t => !t.completed), [todos]);

  if (!USER_ID) {
    return <UserWarning />;
  }

  return (
    <div className="todoapp">
      <h1 className="todoapp__title">todos</h1>
      <div className="todoapp__content">
        <header className="todoapp__header">
          {todos.length > 0 && (
            <button
              type="button"
              className={classNames('todoapp__toggle-all', {
                active: allCompleted,
              })}
              data-cy="ToggleAllButton"
              onClick={handleToggleAll}
            />
          )}
          <form onSubmit={handleAdd}>
            <input
              ref={inputRef}
              value={newTitle}
              data-cy="NewTodoField"
              type="text"
              className="todoapp__new-todo"
              placeholder="What needs to be done?"
              autoFocus
              onChange={e => setNewTitle(e.target.value)}
              disabled={inputDisabled}
            />
          </form>
        </header>

        <section className="todoapp__main" data-cy="TodoList">
          {filtered.map(todo => (
            <div
              data-cy="Todo"
              className={classNames('todo', { completed: todo.completed })}
              key={todo.id}
            >
              <label className="todo__status-label">
                <input
                  data-cy="TodoStatus"
                  type="checkbox"
                  aria-label="Toggle todo status"
                  className="todo__status"
                  checked={todo.completed}
                  onChange={() =>
                    handleUpdate(todo.id, { completed: !todo.completed })
                  }
                  disabled={pendingIds.includes(todo.id) || todo.id === 0}
                />
              </label>

              {editId === todo.id ? (
                <form onSubmit={e => handleFormSave(e, todo.id, todo.title)}>
                  <input
                    ref={editFieldRef}
                    data-cy="TodoTitleField"
                    type="text"
                    className="todo__title-field"
                    defaultValue={todo.title}
                    autoFocus
                    onBlur={e =>
                      handleSave(todo.id, e.target.value, todo.title)
                    }
                    onKeyDown={handleKeyDown}
                  />
                </form>
              ) : (
                <>
                  <span
                    data-cy="TodoTitle"
                    className="todo__title"
                    onDoubleClick={() => handleEdit(todo.id)}
                  >
                    {todo.title}
                  </span>
                  <button
                    type="button"
                    className="todo__remove"
                    data-cy="TodoDelete"
                    onClick={() => handleDelete(todo.id)}
                    disabled={pendingIds.includes(todo.id) || todo.id === 0}
                  >
                    ×
                  </button>
                </>
              )}

              <div
                data-cy="TodoLoader"
                className={classNames('modal overlay', {
                  'is-active': pendingIds.includes(todo.id) || todo.id === 0,
                })}
              >
                <div className="modal-background has-background-white-ter" />
                <div className="loader" />
              </div>
            </div>
          ))}
        </section>

        {todos.length !== 0 && (
          <footer className="todoapp__footer" data-cy="Footer">
            <span className="todo-count" data-cy="TodosCounter">
              {activeItems.length} items left
            </span>
            <nav className="filter" data-cy="Filter">
              <a
                href="#/"
                className={classNames('filter__link', {
                  selected: filter === TodoFilter.All,
                })}
                data-cy="FilterLinkAll"
                onClick={() => setFilter(TodoFilter.All)}
              >
                All
              </a>
              <a
                href="#/active"
                className={classNames('filter__link', {
                  selected: filter === TodoFilter.Active,
                })}
                data-cy="FilterLinkActive"
                onClick={() => setFilter(TodoFilter.Active)}
              >
                Active
              </a>
              <a
                href="#/completed"
                className={classNames('filter__link', {
                  selected: filter === TodoFilter.Completed,
                })}
                data-cy="FilterLinkCompleted"
                onClick={() => setFilter(TodoFilter.Completed)}
              >
                Completed
              </a>
            </nav>
            <button
              type="button"
              className="todoapp__clear-completed"
              data-cy="ClearCompletedButton"
              onClick={handleClearCompleted}
              disabled={!todos.find(t => t.completed)}
            >
              Clear completed
            </button>
          </footer>
        )}
      </div>

      <div
        data-cy="ErrorNotification"
        className={classNames(
          'notification is-danger is-light has-text-weight-normal',
          { hidden: !error },
        )}
      >
        <button
          data-cy="HideErrorButton"
          type="button"
          className="delete"
          onClick={() => setError('')}
        />
        {error}
      </div>
    </div>
  );
};

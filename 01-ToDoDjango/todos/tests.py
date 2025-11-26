from django.test import TestCase
from django.urls import reverse
from datetime import date
from .models import Todo


class TodoTests(TestCase):

    def test_home_page_loads_correctly(self):
        response = self.client.get(reverse("todo_list"))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "todos/home.html")
        self.assertContains(response, "No TODOs yet.")

    def test_list_displays_existing_todos(self):
        Todo.objects.create(title="Test task")
        response = self.client.get(reverse("todo_list"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Test task")

    def test_create_todo_works(self):
        response = self.client.post(reverse("todo_create"), {
            "title": "New task",
            "description": "Details",
            "due_date": "2025-01-01",
            "is_completed": False
        })
        self.assertEqual(response.status_code, 302)
        self.assertEqual(Todo.objects.count(), 1)
        todo = Todo.objects.first()
        self.assertEqual(todo.title, "New task")

    def test_create_todo_rejects_missing_title(self):
        response = self.client.post(reverse("todo_create"), {
            "title": "",
            "description": "Details"
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Todo.objects.count(), 0)
        self.assertContains(response, "This field is required")

    def test_edit_todo_updates_item(self):
        todo = Todo.objects.create(title="Old title")
        response = self.client.post(reverse("todo_edit", args=[todo.pk]), {
            "title": "Updated title",
            "description": "",
            "due_date": "",
            "is_completed": False
        })
        self.assertEqual(response.status_code, 302)
        todo.refresh_from_db()
        self.assertEqual(todo.title, "Updated title")

    def test_delete_todo_removes_item(self):
        todo = Todo.objects.create(title="To delete")
        response = self.client.post(reverse("todo_delete", args=[todo.pk]))
        self.assertEqual(response.status_code, 302)
        self.assertEqual(Todo.objects.count(), 0)

    def test_toggle_completion_changes_state(self):
        todo = Todo.objects.create(title="Toggle task", is_completed=False)

        # First toggle
        response = self.client.get(reverse("todo_toggle_complete", args=[todo.pk]))
        self.assertEqual(response.status_code, 302)
        todo.refresh_from_db()
        self.assertTrue(todo.is_completed)

        # Now check home page displays "closed" or "done"
        response = self.client.get(reverse("todo_list"))
        self.assertContains(response, "done")

        # Second toggle
        response = self.client.get(reverse("todo_toggle_complete", args=[todo.pk]))
        todo.refresh_from_db()
        self.assertFalse(todo.is_completed)

        response = self.client.get(reverse("todo_list"))
        self.assertContains(response, "open")


    def test_due_date_is_saved_correctly(self):
        response = self.client.post(reverse("todo_create"), {
            "title": "With due date",
            "description": "",
            "due_date": "2025-12-31",
            "is_completed": False
        })
        self.assertEqual(response.status_code, 302)
        todo = Todo.objects.first()
        self.assertEqual(todo.due_date, date(2025, 12, 31))

    def test_due_date_displayed_on_home_page(self):
        todo = Todo.objects.create(
            title="Task with due date",
            due_date=date(2025, 12, 31),
            is_completed=False,
        )
        response = self.client.get(reverse("todo_list"))
        self.assertEqual(response.status_code, 200)

        self.assertContains(response, "Task with due date")
        self.assertContains(response, "Dec. 31, 2025")

from django.shortcuts import render, get_object_or_404, redirect
from .models import Todo
from .forms import TodoForm


def todo_list(request):
    todos = Todo.objects.order_by("is_completed", "due_date", "created_at")
    context = {
        "todos": todos,
    }
    return render(request, "todos/home.html", context)


def todo_create(request):
    if request.method == "POST":
        form = TodoForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect("todo_list")
    else:
        form = TodoForm()
    context = {
        "form": form,
        "action": "Create",
    }
    return render(request, "todos/todo_form.html", context)


def todo_edit(request, pk):
    todo = get_object_or_404(Todo, pk=pk)
    if request.method == "POST":
        form = TodoForm(request.POST, instance=todo)
        if form.is_valid():
            form.save()
            return redirect("todo_list")
    else:
        form = TodoForm(instance=todo)
    context = {
        "form": form,
        "action": "Edit",
    }
    return render(request, "todos/todo_form.html", context)


def todo_delete(request, pk):
    todo = get_object_or_404(Todo, pk=pk)
    if request.method == "POST":
        todo.delete()
        return redirect("todo_list")
    context = {
        "todo": todo,
    }
    return render(request, "todos/todo_confirm_delete.html", context)


def todo_toggle_complete(request, pk):
    todo = get_object_or_404(Todo, pk=pk)
    todo.is_completed = not todo.is_completed
    todo.save()
    return redirect("todo_list")

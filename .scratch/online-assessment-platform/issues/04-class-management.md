Status: done

## Parent

[PRD: Online Assessment Platform](../PRD.md)

## What to build

Instructors can create classes. Each class generates a unique invitation code or link. Students see a list of their enrolled classes on their dashboard and can join a new class by entering an invitation code. Each class has exactly one instructor (the one who created it). The admin can also create and archive classes.

Schema: `classes` table (id, name, instructor_id FK → users.id, invite_code unique, archived boolean, created_at) and `class_memberships` table (id, class_id FK, student_id FK, joined_at).

## Acceptance criteria

- [ ] Instructor can create a class with a name — system generates a unique invite code
- [ ] Instructor can view their class's invite code/link on the class page
- [ ] Student dashboard shows list of enrolled classes (empty state if none)
- [ ] Student can click "Join Class", enter an invite code, and be enrolled
- [ ] Invalid invite code shows an error message
- [ ] Student already enrolled in class → joining again shows "already enrolled" message
- [ ] Instructor can view the student roster for their class (list of enrolled students)
- [ ] Admin can create and archive classes
- [ ] Archived classes are hidden from student dashboards
- [ ] Tests: instructor creates class → invite code generated → student joins with code → student sees class on dashboard; invalid code → error; double join → already enrolled

## Blocked by

- 02-auth

---
layout: page
title: projects
permalink: /projects/
description: Selected robotic systems, mechanisms, and controller-facing hardware.
kicker: Selected systems / embodied intelligence
nav: true
nav_order: 3
project_sections:
  - key: research
    label: Current work
    title: Research Systems
    description: Current research platforms that integrate mechanism design, sensing, control, and human–robot interaction.
    grid_class: row-cols-1 row-cols-md-2 project-grid--featured
  - key: technical
    label: Shared foundations
    title: Technical Writing & Infrastructure
    description: Technical series and reusable infrastructure for building, integrating, and controlling robot systems.
    grid_class: row-cols-1 row-cols-sm-2 row-cols-lg-3 project-grid--technical
  - key: earlier
    label: Foundations
    title: Earlier Projects
    description: Coursework and early prototypes that trace the path into robotic systems research.
    grid_class: row-cols-1 row-cols-sm-2 row-cols-lg-4 project-grid--archive
---

<!-- pages/projects.md -->
<div class="projects">
  <p class="projects-intro">
    A layered view of my work—from current research systems, through the technical foundations that support them, to the earlier projects that shaped my practice.
  </p>

  {% for section in page.project_sections %}
    {% assign section_projects = site.projects | where: "project_group", section.key %}
    {% assign sorted_projects = section_projects | sort: "importance" %}
    {% if sorted_projects.size > 0 %}
    <section class="project-section project-section--{{ section.key }}" aria-labelledby="projects-{{ section.key }}">
      <header class="project-section__header">
        <div>
          <p class="project-section__label">{{ section.label }}</p>
          <h2 id="projects-{{ section.key }}" class="project-section__title">{{ section.title }}</h2>
        </div>
        <p class="project-section__description">{{ section.description }}</p>
      </header>

      <div class="row project-grid {{ section.grid_class }}">
    {% for project in sorted_projects %}
      {% include projects.liquid %}
    {% endfor %}
      </div>
    </section>
    {% endif %}
  {% endfor %}
</div>

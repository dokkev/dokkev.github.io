---
layout: page
title: Projects
permalink: /projects/
description:
hide_kicker: true
nav: true
nav_order: 3
project_sections:
  - key: research
    label: 
    title: Research
    description: 
    grid_class: row-cols-1 row-cols-md-2 project-grid--featured
  - key: technical
    label: 
    title: DevLog
    description: 
    grid_class: row-cols-1 row-cols-sm-2 row-cols-lg-3 project-grid--technical
  - key: earlier
    label: 
    title: Earlier Projects
    description: 
    grid_class: row-cols-1 row-cols-sm-2 row-cols-lg-4 project-grid--archive
---

<!-- pages/projects.md -->
<div class="projects">
  <p class="projects-intro">
    <!-- A layered view of my work—from current research systems, through the technical foundations that support them, to the earlier projects that shaped my practice. -->
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

---
title: "{{ replace .File.ContentBaseName "-" " " | title }}"
slug: "{{ .File.ContentBaseName }}"
date: "{{ now.Format "2006-01-02T15:04:05-07:00" }}"
publishDate: "{{ now.Format "2006-01-02T15:04:05-07:00" }}"
draft: true
author: Farzad Sunavala
description: ""
excerpt: ""
topics: []
lastmod: "{{ now.Format "2006-01-02T15:04:05-07:00" }}"
---

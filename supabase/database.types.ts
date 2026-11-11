export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      assignment_questions: {
        Row: {
          assignment_id: string
          points: number
          position: number
          question_id: string
        }
        Insert: {
          assignment_id: string
          points?: number
          position: number
          question_id: string
        }
        Update: {
          assignment_id?: string
          points?: number
          position?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_questions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          chapter_id: number | null
          class_id: string
          created_at: string
          description: string
          due_at: string | null
          duration_minutes: number | null
          id: string
          kind: Database["public"]["Enums"]["assignment_kind"]
          max_attempts: number | null
          published_at: string | null
          question_count: number
          randomize_options: boolean
          randomize_questions: boolean
          status: Database["public"]["Enums"]["assignment_status"]
          teacher_id: string
          title: string
        }
        Insert: {
          chapter_id?: number | null
          class_id: string
          created_at?: string
          description?: string
          due_at?: string | null
          duration_minutes?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["assignment_kind"]
          max_attempts?: number | null
          published_at?: string | null
          question_count?: number
          randomize_options?: boolean
          randomize_questions?: boolean
          status?: Database["public"]["Enums"]["assignment_status"]
          teacher_id: string
          title: string
        }
        Update: {
          chapter_id?: number | null
          class_id?: string
          created_at?: string
          description?: string
          due_at?: string | null
          duration_minutes?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["assignment_kind"]
          max_attempts?: number | null
          published_at?: string | null
          question_count?: number
          randomize_options?: boolean
          randomize_questions?: boolean
          status?: Database["public"]["Enums"]["assignment_status"]
          teacher_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          id: number
          sort_order: number
          summary: string
          title: string
        }
        Insert: {
          id: number
          sort_order: number
          summary?: string
          title: string
        }
        Update: {
          id?: number
          sort_order?: number
          summary?: string
          title?: string
        }
        Relationships: []
      }
      classes: {
        Row: {
          created_at: string
          grade: number
          id: string
          name: string
          school_year: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          grade?: number
          id?: string
          name: string
          school_year?: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          grade?: number
          id?: string
          name?: string
          school_year?: string
          teacher_id?: string
        }
        Relationships: []
      }
      learning_events: {
        Row: {
          chapter_id: number | null
          created_at: string
          event_type: string
          id: number
          question_id: string | null
          skill: string
          student_id: string
        }
        Insert: {
          chapter_id?: number | null
          created_at?: string
          event_type: string
          id?: never
          question_id?: string | null
          skill?: string
          student_id: string
        }
        Update: {
          chapter_id?: number | null
          created_at?: string
          event_type?: string
          id?: never
          question_id?: string | null
          skill?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_events_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_events_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_events_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_materials: {
        Row: {
          chapter_id: number | null
          created_at: string
          id: string
          is_published: boolean
          material_type: string
          storage_path: string
          teacher_id: string
          title: string
        }
        Insert: {
          chapter_id?: number | null
          created_at?: string
          id?: string
          is_published?: boolean
          material_type: string
          storage_path: string
          teacher_id: string
          title: string
        }
        Update: {
          chapter_id?: number | null
          created_at?: string
          id?: string
          is_published?: boolean
          material_type?: string
          storage_path?: string
          teacher_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_materials_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          class_id: string | null
          created_at: string
          display_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          student_code: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          class_id?: string | null
          created_at?: string
          display_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          student_code?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          class_id?: string | null
          created_at?: string
          display_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          student_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      question_answer_keys: {
        Row: {
          answer: Json
          grading_notes: string
          question_id: string
          updated_at: string
        }
        Insert: {
          answer: Json
          grading_notes?: string
          question_id: string
          updated_at?: string
        }
        Update: {
          answer?: Json
          grading_notes?: string
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_answer_keys_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          chapter_id: number | null
          created_at: string
          difficulty: string
          explanation: string
          id: string
          is_published: boolean
          kind: Database["public"]["Enums"]["question_kind"]
          options: Json
          owner_teacher_id: string
          prompt: string
          skill: string
          term: string | null
          updated_at: string
        }
        Insert: {
          chapter_id?: number | null
          created_at?: string
          difficulty?: string
          explanation?: string
          id?: string
          is_published?: boolean
          kind?: Database["public"]["Enums"]["question_kind"]
          options?: Json
          owner_teacher_id: string
          prompt: string
          skill?: string
          term?: string | null
          updated_at?: string
        }
        Update: {
          chapter_id?: number | null
          created_at?: string
          difficulty?: string
          explanation?: string
          id?: string
          is_published?: boolean
          kind?: Database["public"]["Enums"]["question_kind"]
          options?: Json
          owner_teacher_id?: string
          prompt?: string
          skill?: string
          term?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      student_progress: {
        Row: {
          chapter_id: number
          completed_practice: number
          correct_answers: number
          mastery_percent: number
          student_id: string
          updated_at: string
          wrong_answers: number
        }
        Insert: {
          chapter_id: number
          completed_practice?: number
          correct_answers?: number
          mastery_percent?: number
          student_id: string
          updated_at?: string
          wrong_answers?: number
        }
        Update: {
          chapter_id?: number
          completed_practice?: number
          correct_answers?: number
          mastery_percent?: number
          student_id?: string
          updated_at?: string
          wrong_answers?: number
        }
        Relationships: [
          {
            foreignKeyName: "student_progress_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_answers: {
        Row: {
          answered_at: string
          feedback: string
          id: string
          is_correct: boolean | null
          points_awarded: number | null
          question_id: string
          response: Json
          submission_id: string
        }
        Insert: {
          answered_at?: string
          feedback?: string
          id?: string
          is_correct?: boolean | null
          points_awarded?: number | null
          question_id: string
          response?: Json
          submission_id: string
        }
        Update: {
          answered_at?: string
          feedback?: string
          id?: string
          is_correct?: boolean | null
          points_awarded?: number | null
          question_id?: string
          response?: Json
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          assignment_id: string
          attempt_number: number
          id: string
          max_score: number | null
          score: number | null
          started_at: string
          status: string
          student_id: string
          submitted_at: string | null
          teacher_feedback: string
        }
        Insert: {
          assignment_id: string
          attempt_number?: number
          id?: string
          max_score?: number | null
          score?: number | null
          started_at?: string
          status?: string
          student_id: string
          submitted_at?: string | null
          teacher_feedback?: string
        }
        Update: {
          assignment_id?: string
          attempt_number?: number
          id?: string
          max_score?: number | null
          score?: number | null
          started_at?: string
          status?: string
          student_id?: string
          submitted_at?: string | null
          teacher_feedback?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      yare_assignment_attempts: {
        Row: {
          assignment_id: string
          attempt_number: number
          class_id: string
          created_at: string
          deadline_at: string | null
          id: string
          score: number | null
          started_at: string
          status: string
          student_id: string
          submitted_at: string | null
          total_points: number | null
        }
        Insert: {
          assignment_id: string
          attempt_number: number
          class_id: string
          created_at?: string
          deadline_at?: string | null
          id?: string
          score?: number | null
          started_at?: string
          status?: string
          student_id: string
          submitted_at?: string | null
          total_points?: number | null
        }
        Update: {
          assignment_id?: string
          attempt_number?: number
          class_id?: string
          created_at?: string
          deadline_at?: string | null
          id?: string
          score?: number | null
          started_at?: string
          status?: string
          student_id?: string
          submitted_at?: string | null
          total_points?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "yare_assignment_attempts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "yare_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yare_assignment_attempts_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "yare_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      yare_assignment_questions: {
        Row: {
          assignment_id: string
          option_order: Json
          ordinal: number
          question_id: string
        }
        Insert: {
          assignment_id: string
          option_order?: Json
          ordinal: number
          question_id: string
        }
        Update: {
          assignment_id?: string
          option_order?: Json
          ordinal?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "yare_assignment_questions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "yare_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yare_assignment_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "yare_question_bank"
            referencedColumns: ["id"]
          },
        ]
      }
      yare_assignment_responses: {
        Row: {
          attempt_id: string
          created_at: string
          graded_at: string | null
          graded_by: string | null
          id: string
          is_correct: boolean | null
          manual_feedback: string
          points: number | null
          question_id: string
          submitted_answer: Json | null
        }
        Insert: {
          attempt_id: string
          created_at?: string
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_correct?: boolean | null
          manual_feedback?: string
          points?: number | null
          question_id: string
          submitted_answer?: Json | null
        }
        Update: {
          attempt_id?: string
          created_at?: string
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_correct?: boolean | null
          manual_feedback?: string
          points?: number | null
          question_id?: string
          submitted_answer?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "yare_assignment_responses_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "yare_assignment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yare_assignment_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "yare_question_bank"
            referencedColumns: ["id"]
          },
        ]
      }
      yare_assignments: {
        Row: {
          activity_type: string
          available_from: string | null
          available_until: string | null
          chapter_ids: number[]
          class_id: string
          created_at: string
          created_by: string
          duration_minutes: number
          hide_score_from_peers: boolean
          id: string
          is_published: boolean
          lesson_ids: number[]
          max_attempts: number
          question_count: number
          random_options: boolean
          random_questions: boolean
          scope: string
          show_feedback: boolean
          subject: string
          title: string
          updated_at: string
        }
        Insert: {
          activity_type?: string
          available_from?: string | null
          available_until?: string | null
          chapter_ids?: number[]
          class_id: string
          created_at?: string
          created_by: string
          duration_minutes?: number
          hide_score_from_peers?: boolean
          id?: string
          is_published?: boolean
          lesson_ids?: number[]
          max_attempts?: number
          question_count?: number
          random_options?: boolean
          random_questions?: boolean
          scope?: string
          show_feedback?: boolean
          subject?: string
          title: string
          updated_at?: string
        }
        Update: {
          activity_type?: string
          available_from?: string | null
          available_until?: string | null
          chapter_ids?: number[]
          class_id?: string
          created_at?: string
          created_by?: string
          duration_minutes?: number
          hide_score_from_peers?: boolean
          id?: string
          is_published?: boolean
          lesson_ids?: number[]
          max_attempts?: number
          question_count?: number
          random_options?: boolean
          random_questions?: boolean
          scope?: string
          show_feedback?: boolean
          subject?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "yare_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "yare_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      yare_classes: {
        Row: {
          created_at: string
          id: string
          name: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          teacher_id?: string
        }
        Relationships: []
      }
      yare_course_settings: {
        Row: {
          class_id: string
          created_at: string
          id: string
          settings: Json
          subject: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          settings?: Json
          subject: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          settings?: Json
          subject?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "yare_course_settings_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "yare_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      yare_learning_materials: {
        Row: {
          chapter_id: number
          class_id: string
          created_at: string
          created_by: string
          file_path: string
          id: string
          kind: string
          mime_type: string
          size_bytes: number
          title: string
        }
        Insert: {
          chapter_id: number
          class_id: string
          created_at?: string
          created_by: string
          file_path: string
          id?: string
          kind: string
          mime_type: string
          size_bytes: number
          title: string
        }
        Update: {
          chapter_id?: number
          class_id?: string
          created_at?: string
          created_by?: string
          file_path?: string
          id?: string
          kind?: string
          mime_type?: string
          size_bytes?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "yare_learning_materials_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "yare_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      yare_manual_grades: {
        Row: {
          attempt_id: string
          created_at: string
          feedback: string
          grader_id: string
          id: string
          points: number
          response_id: string | null
        }
        Insert: {
          attempt_id: string
          created_at?: string
          feedback?: string
          grader_id: string
          id?: string
          points: number
          response_id?: string | null
        }
        Update: {
          attempt_id?: string
          created_at?: string
          feedback?: string
          grader_id?: string
          id?: string
          points?: number
          response_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "yare_manual_grades_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "yare_assignment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yare_manual_grades_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "yare_assignment_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      yare_practice_attempts: {
        Row: {
          attempt_group: string | null
          chapter_id: number | null
          class_id: string | null
          client_attempt_id: string | null
          created_at: string
          id: string
          is_correct: boolean
          offline_sync: boolean
          question_id: string | null
          question_text: string
          question_type: string
          scoring_source: string
          source: string
          student_id: string
          submitted_answer: Json | null
        }
        Insert: {
          attempt_group?: string | null
          chapter_id?: number | null
          class_id?: string | null
          client_attempt_id?: string | null
          created_at?: string
          id?: string
          is_correct: boolean
          offline_sync?: boolean
          question_id?: string | null
          question_text?: string
          question_type?: string
          scoring_source?: string
          source?: string
          student_id: string
          submitted_answer?: Json | null
        }
        Update: {
          attempt_group?: string | null
          chapter_id?: number | null
          class_id?: string | null
          client_attempt_id?: string | null
          created_at?: string
          id?: string
          is_correct?: boolean
          offline_sync?: boolean
          question_id?: string | null
          question_text?: string
          question_type?: string
          scoring_source?: string
          source?: string
          student_id?: string
          submitted_answer?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "yare_practice_attempts_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "yare_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yare_practice_attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "yare_question_bank"
            referencedColumns: ["id"]
          },
        ]
      }
      yare_profiles: {
        Row: {
          avatar_path: string | null
          class_id: string | null
          created_at: string
          display_name: string
          favorite_skill: string
          id: string
          nickname: string
          role: string
          student_code: string | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          class_id?: string | null
          created_at?: string
          display_name?: string
          favorite_skill?: string
          id: string
          nickname?: string
          role: string
          student_code?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          class_id?: string | null
          created_at?: string
          display_name?: string
          favorite_skill?: string
          id?: string
          nickname?: string
          role?: string
          student_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "yare_profiles_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "yare_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      yare_question_answer_keys: {
        Row: {
          accepted: Json
          explanation: string
          question_id: string
          updated_at: string
        }
        Insert: {
          accepted: Json
          explanation?: string
          question_id: string
          updated_at?: string
        }
        Update: {
          accepted?: Json
          explanation?: string
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "yare_question_answer_keys_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "yare_question_bank"
            referencedColumns: ["id"]
          },
        ]
      }
      yare_question_bank: {
        Row: {
          chapter_id: number
          class_id: string | null
          created_at: string
          created_by: string | null
          difficulty: string
          id: string
          is_active: boolean
          lesson_id: number
          options: Json
          pdf_sample_set: string | null
          prompt: string
          question_type: string
          skill: string
          sort_order: number
          subject: string
          updated_at: string
        }
        Insert: {
          chapter_id: number
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          difficulty?: string
          id?: string
          is_active?: boolean
          lesson_id?: number
          options?: Json
          pdf_sample_set?: string | null
          prompt: string
          question_type: string
          skill?: string
          sort_order?: number
          subject?: string
          updated_at?: string
        }
        Update: {
          chapter_id?: number
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          difficulty?: string
          id?: string
          is_active?: boolean
          lesson_id?: number
          options?: Json
          pdf_sample_set?: string | null
          prompt?: string
          question_type?: string
          skill?: string
          sort_order?: number
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "yare_question_bank_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "yare_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      yare_student_attendance_days: {
        Row: {
          active_seconds: number
          class_id: string
          created_at: string
          first_seen_at: string
          jalali_day: number
          jalali_month: number
          jalali_year: number
          last_seen_at: string
          student_id: string
          updated_at: string
        }
        Insert: {
          active_seconds?: number
          class_id: string
          created_at?: string
          first_seen_at: string
          jalali_day: number
          jalali_month: number
          jalali_year: number
          last_seen_at: string
          student_id: string
          updated_at?: string
        }
        Update: {
          active_seconds?: number
          class_id?: string
          created_at?: string
          first_seen_at?: string
          jalali_day?: number
          jalali_month?: number
          jalali_year?: number
          last_seen_at?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "yare_student_attendance_days_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "yare_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yare_student_attendance_days_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "yare_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      yare_student_credentials: {
        Row: {
          class_id: string
          created_at: string
          encrypted_password: string | null
          student_id: string
          updated_at: string
          username: string
        }
        Insert: {
          class_id: string
          created_at?: string
          encrypted_password?: string | null
          student_id: string
          updated_at?: string
          username: string
        }
        Update: {
          class_id?: string
          created_at?: string
          encrypted_password?: string | null
          student_id?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "yare_student_credentials_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "yare_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      yare_student_monthly_evaluations: {
        Row: {
          art: string | null
          class_id: string
          created_at: string
          heavenly_gifts: string | null
          jalali_month: number
          jalali_year: number
          math: string | null
          persian: string | null
          physical_education: string | null
          quran: string | null
          science: string | null
          social_studies: string | null
          student_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          art?: string | null
          class_id: string
          created_at?: string
          heavenly_gifts?: string | null
          jalali_month: number
          jalali_year: number
          math?: string | null
          persian?: string | null
          physical_education?: string | null
          quran?: string | null
          science?: string | null
          social_studies?: string | null
          student_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          art?: string | null
          class_id?: string
          created_at?: string
          heavenly_gifts?: string | null
          jalali_month?: number
          jalali_year?: number
          math?: string | null
          persian?: string | null
          physical_education?: string | null
          quran?: string | null
          science?: string | null
          social_studies?: string | null
          student_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "yare_student_monthly_evaluations_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "yare_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yare_student_monthly_evaluations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "yare_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      yare_student_presence: {
        Row: {
          class_id: string
          last_seen_at: string
          student_id: string
        }
        Insert: {
          class_id: string
          last_seen_at?: string
          student_id: string
        }
        Update: {
          class_id?: string
          last_seen_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "yare_student_presence_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "yare_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      yare_subject_practice_progress: {
        Row: {
          activity_key: string
          activity_type: string
          attempt_count: number
          class_id: string | null
          correct_answer: number | null
          created_at: string
          explanation: string
          id: string
          is_correct: boolean
          lesson_id: number
          metadata: Json
          question_text: string
          scoring_source: string
          selected_answer: number | null
          student_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          activity_key: string
          activity_type?: string
          attempt_count?: number
          class_id?: string | null
          correct_answer?: number | null
          created_at?: string
          explanation?: string
          id?: string
          is_correct?: boolean
          lesson_id: number
          metadata?: Json
          question_text?: string
          scoring_source?: string
          selected_answer?: number | null
          student_id: string
          subject: string
          updated_at?: string
        }
        Update: {
          activity_key?: string
          activity_type?: string
          attempt_count?: number
          class_id?: string | null
          correct_answer?: number | null
          created_at?: string
          explanation?: string
          id?: string
          is_correct?: boolean
          lesson_id?: number
          metadata?: Json
          question_text?: string
          scoring_source?: string
          selected_answer?: number | null
          student_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "yare_subject_practice_progress_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "yare_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yare_subject_practice_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "yare_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_student_in_class: { Args: { p_class: string }; Returns: boolean }
      is_teacher_of_class: { Args: { p_class: string }; Returns: boolean }
      owns_question: { Args: { p_question: string }; Returns: boolean }
      record_yare_student_attendance_heartbeat: {
        Args: {
          p_class_id: string
          p_jalali_day: number
          p_jalali_month: number
          p_jalali_year: number
          p_seen_at: string
          p_student_id: string
        }
        Returns: undefined
      }
      yare_current_user_class_id: { Args: never; Returns: string }
      yare_current_user_is_teacher: { Args: never; Returns: boolean }
      yare_list_student_credential_status: {
        Args: { p_class_id: string }
        Returns: {
          has_password: boolean
          student_id: string
        }[]
      }
      yare_list_student_credentials: {
        Args: { p_class_id: string }
        Returns: {
          initial_password: string
          student_id: string
        }[]
      }
      yare_save_question_with_key: {
        Args: {
          p_accepted: Json
          p_chapter_id: number
          p_class_id: string
          p_created_by: string
          p_difficulty: string
          p_explanation: string
          p_lesson_id: number
          p_options: Json
          p_prompt: string
          p_question_id: string
          p_question_type: string
          p_skill: string
          p_source_question_id: string
          p_subject: string
        }
        Returns: string
      }
      yare_store_student_credential: {
        Args: {
          p_class_id: string
          p_password: string
          p_student_id: string
          p_username: string
        }
        Returns: undefined
      }
      yare_teacher_can_access_class: {
        Args: { target_class_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "teacher" | "student"
      assignment_kind: "practice" | "chapter_exam" | "midterm" | "final"
      assignment_status: "draft" | "published" | "closed"
      question_kind: "mc" | "short" | "true_false" | "multi" | "written"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["teacher", "student"],
      assignment_kind: ["practice", "chapter_exam", "midterm", "final"],
      assignment_status: ["draft", "published", "closed"],
      question_kind: ["mc", "short", "true_false", "multi", "written"],
    },
  },
} as const

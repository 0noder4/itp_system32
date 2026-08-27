import * as z from "zod";

export const stage1Schema = z.object({
  basic_data: z.object({
    full_name: z.string().min(1, "Full name is required").max(255, "Full name must be 255 characters or less"),
    nip: z.string().min(1, "NIP is required").max(20, "NIP must be 20 characters or less"),
  }),
  address: z.object({
    street: z.string().min(1, "Street is required").max(255, "Street must be 255 characters or less"),
    home_number: z.string().min(1, "Home number is required").max(10, "Home number must be 10 characters or less"),
    apt_number: z.string().max(10, "Apartment number must be 10 characters or less").optional(),
    city: z.string().min(1, "City is required").max(100, "City must be 100 characters or less"),
    country: z.string().min(1, "Country is required").max(100, "Country must be 100 characters or less"),
    postal_code: z.string().min(1, "Postal code is required").max(20, "Postal code must be 20 characters or less"),
  }),
  terms_accepted: z.boolean().optional(),
});

export const stage2Schema = z.object({
  stand_details: z
    .object({
      stand_type: z.enum(["provided_stand", "self_construction"], {
        message: "Stand type is required",
      }),
      sc_details: z.string().max(255, "Description must be 255 characters or less").optional(),
      name_sign_text: z.string().max(255, "Name sign text must be 255 characters or less").optional(),
      logo_sign_file: z.any().optional(), // File upload
      fire_cert: z.any().optional(), // File upload
    })
    .superRefine((data, ctx) => {
      // If provided_stand is selected, name_sign_text and logo_sign_file are required
      if (data.stand_type === "provided_stand") {
        if (
          !data.name_sign_text ||
          (typeof data.name_sign_text === "string" &&
            data.name_sign_text.trim() === "")
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Name sign text is required for provided stand",
            path: ["name_sign_text"],
          });
        }
        // Logo file is required - either a new File or existing file URL
        const hasLogoFile =
          data.logo_sign_file &&
          (data.logo_sign_file instanceof File ||
            typeof data.logo_sign_file === "string");
        if (!hasLogoFile) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Logo file is required for provided stand",
            path: ["logo_sign_file"],
          });
        }
      }
      // If self_construction is selected, fire_cert is required
      if (data.stand_type === "self_construction") {
        // Fire cert is required - either a new File or existing file URL
        const hasFireCert =
          data.fire_cert &&
          (data.fire_cert instanceof File ||
            typeof data.fire_cert === "string");
        if (!hasFireCert) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Fire certificate is required for self construction",
            path: ["fire_cert"],
          });
        }
      }
    }),
  equipment_selections: z
    .array(
      z.object({
        equipment_item: z.number(),
        quantity: z.number().min(0, "Quantity must be 0 or greater"),
      })
    )
    .optional(),
});

export const stage3Schema = z.object({
  workshop: z.boolean(),
  notes: z.string().optional(),
});

export const stage4Schema = z.object({
  jobwalls: z
    .array(
      z.object({
        name: z.string().min(1, "Position name is required"),
        form: z.enum(["s", "z", "h", "k", "m"], {
          message: "Work form is required",
        }),
        workload: z.enum(["pelen", "pol", "trzyczwarte", "el"], {
          message: "Workload is required",
        }),
        contract: z.enum(["uop", "uoz", "uod", "b2b", "uos"], {
          message: "Contract type is required",
        }),
        description: z.string().min(1, "Description is required"),
        benefits: z.string().min(1, "Benefits are required"),
        requirements: z.string().min(1, "Requirements are required"),
        url: z
          .string()
          .min(1, "Application URL or email is required")
          .refine(
            (val) => {
              // Check if it's a valid URL
              try {
                new URL(val);
                return true;
              } catch {
                // Check if it's a valid email
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                return emailRegex.test(val);
              }
            },
            {
              message: "Must be a valid URL or email address",
            }
          ),
      })
    )
    .optional(),
  description: z
    .object({
      descr: z.string().min(1, "Description is required"),
      logo_file: z.any().optional(), // File upload
    })
    .refine(
      (data) => {
        // Logo file is required - either a new File or existing file URL
        const hasLogoFile =
          data.logo_file &&
          (data.logo_file instanceof File ||
            typeof data.logo_file === "string");
        return hasLogoFile;
      },
      {
        message: "Catalogue logo is required",
        path: ["logo_file"],
      }
    )
    .nullable()
    .optional(),
});

export const stage5Schema = z
  .object({
    final_data: z.object({
      el_devices: z.string().max(255, "Electric devices must be 255 characters or less"),
      el_power: z.string().max(255, "Electric power must be 255 characters or less"),
      el_low_power: z.boolean(),
      lunches_declined: z.boolean(),
      no_other_delegates: z.boolean(),
      main_rep_name: z.string(),
      main_rep_surname: z.string(),
      main_rep_phone: z.string(),
      main_rep_attendance: z.enum(["both", "day1", "day2", "none", ""]),
    }),
    lunches: z.array(
      z.object({
        day: z.enum(["day1", "day2"], {
          message: "Day is required",
        }),
        lunch_quantity: z
          .number()
          .min(0, "Lunch quantity must be 0 or greater"),
        diet_info: z.enum(["meat", "vegetarian", "vegan"], {
          message: "Diet selection is required",
        }),
      })
    ),
    pdi: z
      .object({
        tickets_quantity: z
          .number()
          .min(0, "Tickets quantity must be 0 or greater"),
      })
      .nullable()
      .optional(),
    exhibitors: z.array(
      z.object({
        name: z.string(),
        surname: z.string(),
        phone_number: z.string(),
        attendance: z.enum(["both", "day1", "day2", "none", ""]),
      })
    ),
  })
  .superRefine((data, ctx) => {
    const phoneRegex =
      /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/;

    const validatePhone = (value: string, path: (string | number)[]) => {
      if (!value.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Phone number is required",
          path,
        });
        return;
      }
      if (!phoneRegex.test(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please enter a valid phone number.",
          path,
        });
        return;
      }
      const digitCount = (value.match(/\d/g) || []).length;
      if (digitCount < 7 || digitCount > 15) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Phone number must contain between 7 and 15 digits.",
          path,
        });
      }
    };

    if (!data.final_data.el_low_power) {
      if (!data.final_data.el_devices.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "List devices separated by commas, or select low power",
          path: ["final_data", "el_devices"],
        });
      }
      if (!data.final_data.el_power.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter total power in watts, or select low power",
          path: ["final_data", "el_power"],
        });
      } else if (!/^\d+$/.test(data.final_data.el_power.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Power must contain digits only",
          path: ["final_data", "el_power"],
        });
      }
    }

    if (data.final_data.lunches_declined) {
      // lunches cleared in UI
    } else {
      const totalLunches = data.lunches.reduce(
        (sum, lunch) => sum + (lunch.lunch_quantity || 0),
        0
      );
      if (totalLunches < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Choose lunch orders or select decline lunches",
          path: ["final_data", "lunches_declined"],
        });
      }
    }

    if (!data.final_data.main_rep_name.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "First name is required",
        path: ["final_data", "main_rep_name"],
      });
    }
    if (!data.final_data.main_rep_surname.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Last name is required",
        path: ["final_data", "main_rep_surname"],
      });
    }
    validatePhone(data.final_data.main_rep_phone, [
      "final_data",
      "main_rep_phone",
    ]);
    if (
      !data.final_data.main_rep_attendance ||
      !["both", "day1", "day2", "none"].includes(
        data.final_data.main_rep_attendance
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Attendance selection is required",
        path: ["final_data", "main_rep_attendance"],
      });
    }

    if (data.final_data.no_other_delegates) {
      // exhibitors cleared in UI
    } else if (data.exhibitors.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add delegates or select no other delegates",
        path: ["final_data", "no_other_delegates"],
      });
    } else {
      data.exhibitors.forEach((exhibitor, index) => {
        if (!exhibitor.name.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "First name is required",
            path: ["exhibitors", index, "name"],
          });
        }
        if (!exhibitor.surname.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Last name is required",
            path: ["exhibitors", index, "surname"],
          });
        }
        validatePhone(exhibitor.phone_number, [
          "exhibitors",
          index,
          "phone_number",
        ]);
        if (
          !exhibitor.attendance ||
          !["both", "day1", "day2", "none"].includes(exhibitor.attendance)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Attendance selection is required",
            path: ["exhibitors", index, "attendance"],
          });
        }
      });
    }

    const mainAttendance = data.final_data.main_rep_attendance;
    const exhibitors = data.final_data.no_other_delegates ? [] : data.exhibitors;

    const coversDay = (
      attendance: string | undefined,
      day: "day1" | "day2"
    ) => {
      if (attendance === "both") return true;
      return attendance === day;
    };

    const countCoverage = (day: "day1" | "day2") => {
      let count = coversDay(mainAttendance, day) ? 1 : 0;
      for (const exhibitor of exhibitors) {
        if (coversDay(exhibitor.attendance, day)) count += 1;
      }
      return count;
    };

    if (
      mainAttendance === "none" &&
      data.final_data.no_other_delegates
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one person must attend each fair day",
        path: ["final_data", "main_rep_attendance"],
      });
    } else if (mainAttendance) {
      for (const day of ["day1", "day2"] as const) {
        if (countCoverage(day) < 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "At least one person must attend each fair day",
            path: ["final_data", "main_rep_attendance"],
          });
          break;
        }
      }
    }
  });

export type Stage1FormData = z.infer<typeof stage1Schema>;
export type Stage2FormData = z.infer<typeof stage2Schema>;
export type Stage3FormData = z.infer<typeof stage3Schema>;
export type Stage4FormData = z.infer<typeof stage4Schema>;
export type Stage5FormData = z.infer<typeof stage5Schema>;

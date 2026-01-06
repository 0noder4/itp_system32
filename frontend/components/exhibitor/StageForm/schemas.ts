import * as z from "zod";

export const stage1Schema = z.object({
  basic_data: z.object({
    full_name: z.string().min(1),
    nip: z.string().min(1),
  }),
  address: z.object({
    street: z.string().min(1),
    home_number: z.string().min(1),
    apt_number: z.string().optional(),
    city: z.string().min(1),
    country: z.string().min(1),
    postal_code: z.string().min(1),
  }),
  terms_accepted: z.boolean().optional(),
});

export const stage2Schema = z.object({
  stand_details: z
    .object({
      stand_type: z.enum(["provided_stand", "self_construction"]),
      sc_details: z.string().optional(),
      name_sign_text: z.string().optional(),
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
        quantity: z.number().min(0),
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
        name: z.string().min(1),
        form: z.enum(["s", "z", "h", "k", "m"]),
        workload: z.enum(["pelen", "pol", "trzyczwarte", "el"]),
        contract: z.enum(["uop", "uoz", "uod", "b2b", "uos"]),
        description: z.string().min(1),
        benefits: z.string().min(1),
        requirements: z.string().min(1),
        url: z.string().refine(
          (val) => {
            // Allow empty string (optional field)
            if (!val || val.trim() === "") return true;
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
      descr: z.string().min(1),
      logo_file: z.any().optional(), // File upload
    })
    .nullable()
    .optional(),
});

export const stage5Schema = z.object({
  final_data: z.object({
    el_devices: z.string().min(1),
    el_power: z.string().min(1),
  }),
  lunches: z
    .array(
      z.object({
        day: z.enum(["day1", "day2"]),
        lunch_quantity: z.number().min(0),
        diet_info: z.string(),
      })
    )
    .optional(),
  pdi: z
    .object({
      tickets_quantity: z.number().min(0),
    })
    .nullable()
    .optional(),
  exhibitors: z
    .array(
      z.object({
        name: z.string().min(1),
        surname: z.string().min(1),
        phone_number: z.string().min(1),
      })
    )
    .optional(),
});

export type Stage1FormData = z.infer<typeof stage1Schema>;
export type Stage2FormData = z.infer<typeof stage2Schema>;
export type Stage3FormData = z.infer<typeof stage3Schema>;
export type Stage4FormData = z.infer<typeof stage4Schema>;
export type Stage5FormData = z.infer<typeof stage5Schema>;
